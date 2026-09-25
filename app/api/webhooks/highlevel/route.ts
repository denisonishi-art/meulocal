import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {createHash,verify as verifySignature} from 'crypto';
import {getLocationAccessToken,removeOperationalTags} from '@/lib/highlevel-operational';
import {isExplicitVoiceRequest} from '@/lib/agents/voice-request';
import {startPipecatVoiceCall} from '@/lib/pipecat-voice';
import {buildVoiceSalesInstructions} from '@/lib/agents/voice-sales';

function eventId(body:any){
  const explicit=body?.id||body?.eventId||body?.messageId||body?.message?.id;
  if(explicit)return String(explicit);
  return createHash('sha256').update(JSON.stringify({type:body?.type||body?.event,locationId:body?.locationId,contactId:body?.contactId,timestamp:body?.timestamp||body?.dateAdded||null,status:body?.status||null})).digest('hex');
}

function normalize(body:any){
  const type=String(body?.type||body?.event||'unknown');
  const direction=body?.direction||body?.message?.direction||null;
  const channel=body?.messageType||body?.channel||body?.message?.type||null;
  const status=body?.status||body?.message?.status||null;
  const text=String(body?.body||body?.message?.body||body?.message||'').trim();
  const explicitStop=/^(sair|stop|cancelar|unsubscribe)$/i.test(text);
  const optedOut=Boolean(body?.optedOut||body?.dnd||explicitStop||/opt.?out|unsubscribe|dnd/i.test(type));
  const conversion=Boolean(body?.conversion||/conversion|opportunity.*won|payment/i.test(type));
  return {
    external_event_id:eventId(body),event_type:type,ghl_location_id:body?.locationId||body?.location?.id||null,
    contact_id:body?.contactId||body?.contact?.id||null,conversation_id:body?.conversationId||body?.conversation?.id||null,
    message_id:body?.messageId||body?.message?.id||null,direction,channel,normalized_status:status,opted_out:optedOut,conversion,
    payload_meta:{hasMessage:Boolean(body?.message||body?.messageId),hasContact:Boolean(body?.contact||body?.contactId),preview:text.slice(0,500),source:'highlevel_webhook'}
  };
}

const GHL_PUBLIC_KEY='-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAi2HR1srL4o18O8BRa7gVJY7G7bupbN3H9AwJrHCDiOg=\n-----END PUBLIC KEY-----';

function validWebhook(request:Request,raw:string){
  const signed=request.headers.get('x-ghl-signature');
  if(signed){
    try{return verifySignature(null,Buffer.from(raw,'utf8'),GHL_PUBLIC_KEY,Buffer.from(signed,'base64'))}catch{return false}
  }
  const secret=process.env.GHL_WEBHOOK_SECRET;
  return Boolean(secret&&request.headers.get('x-meulocal-webhook-token')===secret);
}

export async function POST(request:Request){
  const raw=await request.text();
  if(!validWebhook(request,raw))return NextResponse.json({error:'Não autorizado.'},{status:401});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)return NextResponse.json({error:'Supabase não configurado.'},{status:503});
  let body:any=null;try{body=JSON.parse(raw)}catch{}
  if(!body)return NextResponse.json({error:'Payload inválido.'},{status:400});
  const db=createClient(url,key);const row=normalize(body);
  const {error}=await db.from('ghl_events').insert(row);
  if(error?.code==='23505')return NextResponse.json({ok:true,duplicate:true,eventId:row.external_event_id});
  if(error)return NextResponse.json({error:'Falha ao registrar evento.'},{status:500});
  // Customer review automation events are handled first. GHL remains invisible to the customer.
  if(row.ghl_location_id&&row.contact_id){
    const {data:customerContact}=await db.from('customer_contacts')
      .select('id,business_id,status')
      .eq('ghl_location_id',row.ghl_location_id).eq('ghl_contact_id',row.contact_id).maybeSingle();
    if(customerContact){
      const {data:enrollment}=await db.from('review_request_enrollments')
        .select('id,status').eq('contact_id',customerContact.id)
        .in('status',['queued','active']).order('created_at',{ascending:false}).limit(1).maybeSingle();
      if(enrollment){
        let eventType:string|null=null;
        if(row.opted_out)eventType='opted_out';
        else if(row.direction==='inbound')eventType='replied';
        else if(row.normalized_status==='delivered')eventType='delivered';
        else if(row.normalized_status==='failed'||row.normalized_status==='undelivered')eventType='failed';
        else if(row.normalized_status==='sent')eventType='sent';
        if(eventType){
          const mappedChannel=/whatsapp/i.test(String(row.channel||''))?'whatsapp':/email/i.test(String(row.channel||''))?'email':'system';
          await db.from('review_request_events').insert({
            business_id:customerContact.business_id,enrollment_id:enrollment.id,contact_id:customerContact.id,
            channel:mappedChannel,event_type:eventType,provider:'highlevel',external_id:row.message_id,
            metadata:{source:'highlevel_webhook',conversation_id:row.conversation_id,raw_event_type:row.event_type}
          });
          if(eventType==='opted_out'){
            await db.from('customer_contacts').update({status:'opted_out',opt_out_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',customerContact.id);
            await db.from('review_request_enrollments').update({status:'opted_out',next_run_at:null,completed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',enrollment.id);
          }else if(eventType==='replied'){
            await db.from('customer_contacts').update({status:'completed',updated_at:new Date().toISOString()}).eq('id',customerContact.id);
            await db.from('review_request_enrollments').update({status:'completed',next_run_at:null,completed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',enrollment.id);
          }
        }
      }
      return NextResponse.json({ok:true,duplicate:false,eventId:row.external_event_id,customerFlow:true});
    }
  }

  // Acquisition cadence events: keep prospect status synchronized and stop follow-ups on replies/opt-out.
  if(row.ghl_location_id&&row.contact_id){
    const {data:lead}=await db.from('leads').select('id,business_id,lifecycle_stage,prospect_diagnostic_id,opt_out_at,last_reply_at,whatsapp').eq('ghl_location_id',row.ghl_location_id).eq('ghl_contact_id',row.contact_id).maybeSingle();
    if(lead){
      let eventType:string|null=null;
      if(row.opted_out)eventType='unsubscribed';
      else if(row.direction==='inbound')eventType='replied';
      else if(row.normalized_status==='delivered')eventType='delivered';
      else if(row.normalized_status==='failed'||row.normalized_status==='undelivered')eventType='failed';
      else if(row.normalized_status==='sent')eventType='sent';
      if(eventType){
        const mappedChannel=/whatsapp/i.test(String(row.channel||''))?'whatsapp':/email/i.test(String(row.channel||''))?'email':'system';
        const {data:lastOutbound}=await db.from('outreach_events').select('message_key').eq('lead_id',lead.id).in('event_type',['sent','delivered']).order('created_at',{ascending:false}).limit(1).maybeSingle();
        await db.from('outreach_events').insert({lead_id:lead.id,channel:mappedChannel,event_type:eventType,provider:'highlevel',external_id:row.message_id,conversation_id:row.conversation_id,message_key:lastOutbound?.message_key||null,metadata:{source:'highlevel_webhook',raw_event_type:row.event_type,preview:row.payload_meta.preview}});
        const now=new Date().toISOString();
        if(eventType==='unsubscribed'){
          await db.from('leads').update({lifecycle_stage:'lost',opt_out_at:now,next_action_at:null,updated_at:now}).eq('id',lead.id);
          await db.from('automation_enrollments').update({status:'cancelled',next_run_at:null,completed_at:now}).eq('lead_id',lead.id).eq('track','meulocal_acquisition').eq('status','active');
          await db.from('businesses').update({status:'lost',updated_at:now}).eq('id',lead.business_id);
        }else if(eventType==='replied'){
          await db.from('leads').update({lifecycle_stage:'conversation',last_reply_at:now,next_action_at:null,updated_at:now}).eq('id',lead.id);
          await db.from('automation_enrollments').update({status:'completed',next_run_at:null,completed_at:now}).eq('lead_id',lead.id).eq('track','meulocal_acquisition').eq('status','active');
          await db.from('businesses').update({status:'engaged',updated_at:now}).eq('id',lead.business_id);
          try{const token=await getLocationAccessToken(row.ghl_location_id);await removeOperationalTags({token,contactId:row.contact_id,tags:['meulocal:prospectar','follow-up']})}catch{}

          const inboundText=String(row.payload_meta?.preview||'').trim();
          if(isExplicitVoiceRequest(inboundText)){
            const contactPhone=String(body?.contact?.phone||lead.whatsapp||'').trim();
            const {data:business}=await db.from('businesses').select('name').eq('id',lead.business_id).maybeSingle();
            const {data:diagnostic}=lead.prospect_diagnostic_id
              ? await db.from('prospect_diagnostics').select('score,rating,review_count,summary,diagnostic_summary').eq('id',lead.prospect_diagnostic_id).maybeSingle()
              : {data:null as any};
            const diagnosticSummary=String(diagnostic?.summary||diagnostic?.diagnostic_summary||'').trim()||null;
            const salesInstructions=buildVoiceSalesInstructions({
              businessName:business?.name||null,
              score:typeof diagnostic?.score==='number'?diagnostic.score:null,
              rating:typeof diagnostic?.rating==='number'?diagnostic.rating:null,
              reviewCount:typeof diagnostic?.review_count==='number'?diagnostic.review_count:null,
              diagnosticSummary,
              requestedText:inboundText,
            });
            const voiceRequest={
              lead_id:lead.id,
              prospect_diagnostic_id:lead.prospect_diagnostic_id||null,
              external_event_id:row.external_event_id,
              phone:contactPhone||null,
              requested_text:inboundText.slice(0,500),
              provider:'pipecat',
              status:contactPhone?'requested':'failed',
              error_message:contactPhone?null:'Telefone indisponível para retorno.',
              requested_at:now,
              updated_at:now,
            };
            const {data:voiceRow,error:voiceInsertError}=await db.from('voice_call_requests').insert(voiceRequest).select('id').maybeSingle();
            if(!voiceInsertError&&voiceRow&&contactPhone){
              const result=await startPipecatVoiceCall({
                phoneNumber:contactPhone,
                leadId:lead.id,
                prospectDiagnosticId:lead.prospect_diagnostic_id||null,
                businessName:business?.name||null,
                requestedText:inboundText,
                score:typeof diagnostic?.score==='number'?diagnostic.score:null,
                rating:typeof diagnostic?.rating==='number'?diagnostic.rating:null,
                reviewCount:typeof diagnostic?.review_count==='number'?diagnostic.review_count:null,
                diagnosticSummary,
                salesInstructions,
              });
              if(result.ok){
                await db.from('voice_call_requests').update({status:'started',external_call_id:result.callId,started_at:now,updated_at:now}).eq('id',voiceRow.id);
              }else{
                await db.from('voice_call_requests').update({status:result.status,error_message:result.reason,updated_at:now}).eq('id',voiceRow.id);
              }
            }
          }
        }
      }
      return NextResponse.json({ok:true,duplicate:false,eventId:row.external_event_id,acquisitionFlow:true});
    }
  }
  // Keep an activation-safe local record for contacts created or messaged in GHL.
  // Only the verified Asaas payment webhook can turn this into an active account.
  const contact=body?.contact||{};
  const email=typeof contact.email==='string'?contact.email.trim().toLowerCase():'';
  if(email&&row.contact_id){
    const name=String(contact.companyName||contact.name||contact.firstName||email).trim();
    const {data:existingBusiness}=await db.from('businesses').select('id').eq('ghl_contact_id',row.contact_id).eq('ghl_location_id',row.ghl_location_id).maybeSingle();
    let businessId=existingBusiness?.id;
    if(businessId){
      await db.from('businesses').update({name,status:'contacted'}).eq('id',businessId);
    }else{
      const {data:business}=await db.from('businesses').insert({name,source:'outbound',status:'contacted',ghl_contact_id:row.contact_id,ghl_location_id:row.ghl_location_id}).select('id').single();
      businessId=business?.id;
    }
    if(businessId){
      const {data:lead}=await db.from('leads').select('id').eq('business_id',businessId).ilike('email',email).maybeSingle();
      if(!lead)await db.from('leads').insert({business_id:businessId,name,email,origin:'ghl',lifecycle_stage:'conversation'});
    }
  }
  return NextResponse.json({ok:true,duplicate:false,eventId:row.external_event_id});
}
