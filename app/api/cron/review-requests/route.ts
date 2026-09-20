import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {decryptToken,refreshGoogleAccessToken} from '@/lib/google-business-server';
import {getLocationAccessToken,sendOperationalMessage,upsertOperationalContact} from '@/lib/highlevel-operational';

function isAuthorized(req:Request){
  const secret=process.env.CRON_SECRET;
  return Boolean(secret&&req.headers.get('authorization')==='Bearer '+secret);
}
function isWeekend(d:Date){const n=d.getUTCDay();return n===0||n===6}
function nextWeekday(d:Date){const x=new Date(d);while(isWeekend(x))x.setUTCDate(x.getUTCDate()+1);return x}
function nextAttemptAt(now:Date,attemptsAfterSend:number){
  if(attemptsAfterSend>=3)return null;
  const add=attemptsAfterSend===1?3:4;
  const d=new Date(now);d.setUTCDate(d.getUTCDate()+add);d.setUTCHours(12,0,0,0);
  return nextWeekday(d).toISOString();
}
function businessDayNumber(activatedAt:string|null|undefined,now:Date){
  if(!activatedAt)return 3;
  const d=new Date(activatedAt);d.setUTCHours(0,0,0,0);
  const end=new Date(now);end.setUTCHours(0,0,0,0);
  let count=0;
  while(d<=end){if(!isWeekend(d))count++;d.setUTCDate(d.getUTCDate()+1)}
  return Math.max(1,count);
}
function dailyLimit(settings:any,now:Date){
  const day=businessDayNumber(settings.activated_at,now);
  return day===1?settings.day1_limit:day===2?settings.day2_limit:settings.steady_limit;
}
function messageFor(attempt:number,businessName:string,customerName:string,reviewUrl:string){
  const first=customerName?customerName.trim().split(/\s+/)[0]:'';
  const hello=first?'Olá, '+first+'!':'Olá!';
  if(attempt===1)return hello+' Aqui é a '+businessName+'. Como foi sua experiência com a gente?\n\nSe puder, deixe sua avaliação no Google. Leva menos de um minuto:\n'+reviewUrl+'\n\nSe não quiser receber novas mensagens, responda SAIR.';
  if(attempt===2)return hello+' Passando só para lembrar do nosso pedido de avaliação da '+businessName+'. Sua opinião ajuda muito outras pessoas a conhecerem nosso trabalho:\n'+reviewUrl+'\n\nSe não quiser receber novas mensagens, responda SAIR.';
  return hello+' Este é nosso último lembrete. Se tiver um minuto, conte como foi sua experiência com a '+businessName+' no Google:\n'+reviewUrl+'\n\nObrigado! Se não quiser receber novas mensagens, responda SAIR.';
}
async function reviewDestination(db:any,businessId:string){
  const {data:conn}=await db.from('google_business_connections').select('id,google_location_id,google_place_id,google_review_url,google_maps_url,refresh_token_ciphertext').eq('business_id',businessId).eq('status','connected').maybeSingle();
  if(!conn)return null;
  if(conn.google_review_url)return conn.google_review_url as string;
  if(conn.google_place_id)return 'https://search.google.com/local/writereview?placeid='+encodeURIComponent(conn.google_place_id);
  if(!conn.google_location_id||!conn.refresh_token_ciphertext)return conn.google_maps_url||null;
  try{
    const refreshed=await refreshGoogleAccessToken(decryptToken(conn.refresh_token_ciphertext));
    const res=await fetch('https://mybusinessbusinessinformation.googleapis.com/v1/'+conn.google_location_id+'?readMask=metadata',{headers:{Authorization:'Bearer '+refreshed.access_token},cache:'no-store'});
    const payload=await res.json().catch(()=>({}));
    if(!res.ok)return conn.google_maps_url||null;
    const placeId=payload?.metadata?.placeId||null;
    const mapsUri=payload?.metadata?.mapsUri||null;
    const newReviewUri=payload?.metadata?.newReviewUri||null;
    await db.from('google_business_connections').update({google_place_id:placeId,google_maps_url:mapsUri,google_review_url:newReviewUri,updated_at:new Date().toISOString()}).eq('id',conn.id);
    return newReviewUri||(placeId?'https://search.google.com/local/writereview?placeid='+encodeURIComponent(placeId):mapsUri);
  }catch{return conn.google_maps_url||null}
}

export async function GET(req:Request){return run(req)}
export async function POST(req:Request){return run(req)}

async function run(req:Request){
  if(!isAuthorized(req))return NextResponse.json({error:'Não autorizado.'},{status:401});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)return NextResponse.json({error:'Banco não configurado.'},{status:503});
  const db=createClient(url,key,{auth:{persistSession:false}});
  const now=new Date();
  const {data:settings,error:settingsError}=await db.from('review_request_settings').select('*').eq('status','active');
  if(settingsError)return NextResponse.json({error:settingsError.message},{status:500});
  let processed=0,failed=0,completed=0,optedOut=0;
  const details:any[]=[];
  for(const setting of settings||[]){
    const [{data:business},{data:location},reviewUrl]=await Promise.all([
      db.from('businesses').select('id,name').eq('id',setting.business_id).maybeSingle(),
      db.from('ghl_locations').select('ghl_location_id,lifecycle_status').eq('business_id',setting.business_id).eq('lifecycle_status','active').order('created_at',{ascending:false}).limit(1).maybeSingle(),
      reviewDestination(db,setting.business_id)
    ]);
    if(!business?.name||!location?.ghl_location_id||!reviewUrl){details.push({businessId:setting.business_id,status:'waiting_infrastructure',hasBusiness:Boolean(business?.name),hasMessaging:Boolean(location?.ghl_location_id),hasReviewLink:Boolean(reviewUrl)});continue}
    let locationToken:string;
    try{locationToken=await getLocationAccessToken(location.ghl_location_id)}catch(error:any){details.push({businessId:setting.business_id,status:'messaging_auth_failed',error:String(error?.message||error).slice(0,200)});continue}
    const limit=dailyLimit(setting,now);
    const {data:due,error:dueError}=await db.from('review_request_enrollments').select('id,business_id,contact_id,status,current_step,attempts,next_run_at').eq('business_id',setting.business_id).in('status',['queued','active']).lte('next_run_at',now.toISOString()).order('next_run_at',{ascending:true}).limit(limit);
    if(dueError){details.push({businessId:setting.business_id,error:dueError.message});continue}
    if(!due?.length){details.push({businessId:setting.business_id,limit,due:0});continue}
    const contactIds=due.map((x:any)=>x.contact_id);
    const {data:contacts}=await db.from('customer_contacts').select('id,name,email,whatsapp,status,opt_out_at,ghl_contact_id,ghl_location_id').in('id',contactIds);
    const byId=new Map((contacts||[]).map((x:any)=>[x.id,x]));
    let businessProcessed=0;
    for(const enrollment of due){
      const contact:any=byId.get(enrollment.contact_id);
      if(!contact)continue;
      if(contact.opt_out_at||contact.status==='opted_out'){
        await db.from('review_request_enrollments').update({status:'opted_out',completed_at:now.toISOString(),next_run_at:null,updated_at:now.toISOString()}).eq('id',enrollment.id);
        await db.from('review_request_events').insert({business_id:setting.business_id,enrollment_id:enrollment.id,contact_id:contact.id,channel:'system',event_type:'opted_out',provider:'meulocal'});
        optedOut++;continue;
      }
      const {data:stopEvents}=await db.from('review_request_events').select('event_type').eq('enrollment_id',enrollment.id).in('event_type',['replied','opted_out','review_observed']).limit(1);
      if(stopEvents?.length){
        const type=stopEvents[0].event_type;
        await db.from('review_request_enrollments').update({status:type==='opted_out'?'opted_out':'completed',completed_at:now.toISOString(),next_run_at:null,updated_at:now.toISOString()}).eq('id',enrollment.id);
        await db.from('customer_contacts').update({status:type==='opted_out'?'opted_out':'completed',updated_at:now.toISOString()}).eq('id',contact.id);
        completed++;continue;
      }
      let channel:'whatsapp'|'email'|null=contact.whatsapp?'whatsapp':contact.email?'email':null;
      if(!channel){
        await db.from('review_request_enrollments').update({status:'failed',next_run_at:null,updated_at:now.toISOString()}).eq('id',enrollment.id);
        await db.from('customer_contacts').update({status:'invalid',updated_at:now.toISOString()}).eq('id',contact.id);
        await db.from('review_request_events').insert({business_id:setting.business_id,enrollment_id:enrollment.id,contact_id:contact.id,channel:'system',event_type:'failed',provider:'meulocal',metadata:{reason:'no_valid_channel'}});
        failed++;continue;
      }
      const attempt=enrollment.attempts+1;
      try{
        let ghlContactId=contact.ghl_contact_id&&contact.ghl_location_id===location.ghl_location_id?contact.ghl_contact_id:null;
        if(!ghlContactId){
          const upserted=await upsertOperationalContact({token:locationToken,locationId:location.ghl_location_id,name:contact.name,email:contact.email,phone:contact.whatsapp});
          ghlContactId=upserted.id;
          await db.from('customer_contacts').update({ghl_contact_id:ghlContactId,ghl_location_id:location.ghl_location_id,updated_at:now.toISOString()}).eq('id',contact.id);
        }
        const message=messageFor(attempt,business.name,contact.name||'',reviewUrl);
        let sent:any;
        try{sent=await sendOperationalMessage({token:locationToken,contactId:ghlContactId,channel,message,subject:'Como foi sua experiência?',email:contact.email})}
        catch(primaryError:any){if(channel==='whatsapp'&&contact.email){channel='email';sent=await sendOperationalMessage({token:locationToken,contactId:ghlContactId,channel,message,subject:'Como foi sua experiência?',email:contact.email})}else throw primaryError}
        const next=nextAttemptAt(now,attempt);
        const done=attempt>=setting.max_attempts;
        await db.from('review_request_events').insert({business_id:setting.business_id,enrollment_id:enrollment.id,contact_id:contact.id,channel,event_type:'sent',provider:'highlevel',external_id:sent.messageId||null,metadata:{attempt,message_key:attempt===1?'review_request_d0':attempt===2?'review_request_d3':'review_request_d7',conversation_id:sent.conversationId||null}});
        await db.from('review_request_enrollments').update({status:done?'completed':'active',attempts:attempt,current_step:attempt,last_sent_at:now.toISOString(),next_run_at:done?null:next,completed_at:done?now.toISOString():null,updated_at:now.toISOString()}).eq('id',enrollment.id);
        await db.from('customer_contacts').update({status:done?'completed':'active',updated_at:now.toISOString()}).eq('id',contact.id);
        businessProcessed++;processed++;if(done)completed++;
      }catch(error:any){
        await db.from('review_request_events').insert({business_id:setting.business_id,enrollment_id:enrollment.id,contact_id:contact.id,channel,event_type:'failed',provider:'highlevel',metadata:{attempt,error:String(error?.message||error).slice(0,300)}});
        failed++;
      }
    }
    details.push({businessId:setting.business_id,limit,due:due.length,processed:businessProcessed});
  }
  return NextResponse.json({ok:true,processed,failed,completed,optedOut,details});
}