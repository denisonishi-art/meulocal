import {processControlledInbound,drainOpenDotsOutbox} from '@/lib/agents/opendots-outbox';
import {isControlledInboxWakeup,reconcileControlledInbox} from '@/lib/ghl-controlled-reconciliation';
import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {createHash,verify as verifySignature} from 'crypto';
import {getLocationAccessToken,removeOperationalTags} from '@/lib/highlevel-operational';
import {forwardInboundToOpenDots} from '@/lib/agents/opendots-commercial-bridge';
import {CONTROLLED_WORKFLOW_ID,CONTROLLED_LOCATION_ID,CONTROLLED_CONTACT_ID,ControlledInboundError,resolveControlledInbound} from '@/lib/ghl-controlled-inbound';

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
  return Boolean(secret&&(request.headers.get('x-meulocal-webhook-token')===secret||request.headers.get('x-bridge-secret')===secret));
}

export const maxDuration=60;

export async function POST(request:Request){
  const raw=await request.text();
  if(!validWebhook(request,raw))return NextResponse.json({error:'Não autorizado.'},{status:401});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)return NextResponse.json({error:'Supabase não configurado.'},{status:503});
  let body:any=null;try{body=JSON.parse(raw)}catch{}
  if(!body||typeof body!=='object'||Array.isArray(body))return NextResponse.json({error:'Payload inválido.'},{status:400});
  // Explicit mode: the legacy workflow is only a wakeup. Never correlate its body.
  const params=new URL(request.url).searchParams;
  if(params.get('controlled_reconcile')==='1'){
    if(params.get('controlled_native')==='1'||!isControlledInboxWakeup(body))return NextResponse.json({ok:false,error:'controlled_wakeup_scope_refused'},{status:403});
    const db=createClient(url,key);
    const result=await reconcileControlledInbox(db);
    if(!result.ok)return NextResponse.json(result,{status:503,headers:{'Retry-After':'60'}});
    if('busy' in result&&result.busy)return NextResponse.json({...result,ingestion:'leased_by_another_request'},{status:202});
    const deliveryAttempt=await drainOpenDotsOutbox(db);
    console.info(JSON.stringify({stage:'controlled_inbox_ingested',...result,deliveryAttempt}));
    return NextResponse.json({...result,ingestion:'saved',deliveryAttempt},{status:deliveryAttempt.ok?200:503});
  }
  // Native provider events keep immutable message identity. Only this supervised contact
  // enters the durable controlled flow; require the verified signature and live tag.
  const nativeControlled=Boolean(request.headers.get('x-ghl-signature'))&&body.type==='InboundMessage'&&body.locationId===CONTROLLED_LOCATION_ID&&body.contactId===CONTROLLED_CONTACT_ID&&body.direction==='inbound'&&/^(WhatsApp|TYPE_WHATSAPP)$/i.test(String(body.messageType||body.messageTypeString||''));
  if(new URL(request.url).searchParams.get('controlled_native')==='1'&&!nativeControlled)return NextResponse.json({ok:true,ignored:true,reason:'outside_controlled_native_scope'});
  const controlledWorkflow=body?.workflow?.id===CONTROLLED_WORKFLOW_ID||nativeControlled;
  if(controlledWorkflow){
    try{body=await resolveControlledInbound(body,{requireControlledTag:nativeControlled})}catch(error){
      const code=error instanceof ControlledInboundError?error.message:'message_identity_lookup_failed';
      console.warn(JSON.stringify({stage:'highlevel_identity',status:code}));
      return NextResponse.json({ok:false,error:code},{status:error instanceof ControlledInboundError?error.status:503});
    }
  }
  const db=createClient(url,key);const row=normalize(body);
  // Delivery status for monitoring emails is accepted only from signed native events.
  // Provider acceptance and actual delivery remain separate states.
  if(request.headers.get('x-ghl-signature')&&row.event_type==='OutboundMessage'&&row.direction==='outbound'&&/^(Email|TYPE_EMAIL)$/i.test(String(row.channel||body.messageTypeString||''))&&row.contact_id&&row.message_id&&row.ghl_location_id&&['delivered','failed','undelivered'].includes(String(row.normalized_status))){
    const receipt=await db.rpc('record_review_monitor_receipt',{p_location_id:row.ghl_location_id,p_message_id:row.message_id,p_contact_id:row.contact_id,p_status:row.normalized_status==='delivered'?'delivered':'failed'});
    if(receipt.error||receipt.data?.ok!==true)return NextResponse.json({ok:false,error:'monitor_receipt_persistence_failed'},{status:503});
    if(receipt.data.matched)return NextResponse.json({ok:true,monitorReceipt:true});
  }
  if(controlledWorkflow){const result=await processControlledInbound(db,row,body);return NextResponse.json(result,{status:result.httpStatus,headers:result.ok?{}:{'Retry-After':'60'}});}
  // Resolve the customer branch BEFORE the legacy journal/duplicate fast path.
  if(row.ghl_location_id&&row.contact_id){
    const found=await db.from('customer_contacts').select('id,business_id').eq('ghl_location_id',row.ghl_location_id).eq('ghl_contact_id',row.contact_id).maybeSingle();
    if(found.error)return NextResponse.json({ok:false,error:'customer_contact_lookup_failed'},{status:503});
    if(found.data){
      const explicit=body?.id||body?.eventId||body?.messageId||body?.message?.id;
      if(typeof explicit!=='string'||!explicit.trim()||explicit.length>200)return NextResponse.json({ok:false,error:'review_event_identity_required'},{status:400});
      // Status transitions share the immutable message ID; status is part of that receipt key.
      const receiptId=row.direction!=='inbound'&&!row.opted_out&&row.normalized_status?
        'review-status:'+createHash('sha256').update(JSON.stringify([row.ghl_location_id,row.contact_id,explicit,row.event_type,row.normalized_status])).digest('hex'):row.external_event_id;
      const customerRow={...row,external_event_id:receiptId,payload_meta:{...row.payload_meta,eventIdentity:'provider',providerEventId:explicit,contentHash:createHash('sha256').update(String(body?.body||body?.message?.body||body?.message||'').trim()).digest('hex')}};
      const saved=await db.rpc('ingest_customer_review_event',{p_contact_id:found.data.id,p_row:customerRow});
      if(saved.error||saved.data?.ok!==true){
        const conflict=String(saved.error?.message||'').includes('review_event_payload_conflict')||String(saved.error?.message||'').includes('review_event_scope_conflict');
        return NextResponse.json({ok:false,error:conflict?'review_event_conflict':'customer_review_save_failed'},{status:conflict?409:503});
      }
      return NextResponse.json(saved.data);
    }
  }
  const {error}=await db.from('ghl_events').insert(row);
  if(error?.code==='23505')return NextResponse.json({ok:true,duplicate:true,eventId:row.external_event_id});
  if(error)return NextResponse.json({error:'Falha ao registrar evento.'},{status:500});

  // Acquisition cadence events: keep prospect status synchronized and stop follow-ups on replies/opt-out.
  if(row.ghl_location_id&&row.contact_id){
    const {data:lead}=await db.from('leads').select('id,business_id,lifecycle_stage,prospect_diagnostic_id,opt_out_at,last_reply_at').eq('ghl_location_id',row.ghl_location_id).eq('ghl_contact_id',row.contact_id).maybeSingle();
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
          // Offer this inbound event to OpenDots after the existing stop-on-reply logic.
          // The bridge is disabled without explicit runtime configuration; no message is sent.
          const openDots=await forwardInboundToOpenDots({eventId:row.external_event_id,leadId:lead.id,contactId:row.contact_id,locationId:row.ghl_location_id,conversationId:row.conversation_id,messageId:row.message_id,message:String(body?.body||body?.message?.body||'').slice(0,2000),channel:row.channel}).catch(()=>({status:'unavailable'} as const));
          const {error:receiptError}=await db.from('ghl_events').update({payload_meta:{...row.payload_meta,openDots}}).eq('external_event_id',row.external_event_id).eq('ghl_location_id',row.ghl_location_id).eq('contact_id',row.contact_id).select('id').single();
          console.info(JSON.stringify({stage:'highlevel_opendots',eventId:row.external_event_id,messageId:row.message_id,openDots:openDots.status,receiptSaved:!receiptError}));
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
