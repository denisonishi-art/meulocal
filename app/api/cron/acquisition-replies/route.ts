import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {findOperationalConversation,getLocationAccessToken,getOperationalConversationMessages,removeOperationalTags} from '@/lib/highlevel-operational';

function authorized(req:Request){const secret=process.env.CRON_SECRET;return Boolean(secret&&req.headers.get('authorization')==='Bearer '+secret)}
function channel(message:any){return /email/i.test(String(message?.messageType||message?.type||''))?'email':/whatsapp|sms/i.test(String(message?.messageType||message?.type||''))?'whatsapp':'system'}

export async function GET(req:Request){
  if(!authorized(req))return NextResponse.json({error:'Não autorizado.'},{status:401});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY,locationId=process.env.GHL_LOCATION_ID||'uNh3KsM7WFuLeTN8Q583';
  if(!url||!key)return NextResponse.json({error:'Banco não configurado.'},{status:503});
  let token:string;try{token=await getLocationAccessToken(locationId)}catch(error:any){return NextResponse.json({ok:false,error:String(error?.message||error).slice(0,200)},{status:503})}
  const db=createClient(url,key,{auth:{persistSession:false}});
  const {data:leads,error}=await db.from('leads').select('id,business_id,ghl_contact_id,ghl_location_id,last_reply_at,created_at').eq('automation_track','meulocal_acquisition').not('ghl_contact_id','is',null).is('last_reply_at',null).in('lifecycle_stage',['lead','mql']).order('created_at',{ascending:false}).limit(100);
  if(error)return NextResponse.json({error:error.message},{status:500});
  let checked=0,replied=0;const now=new Date().toISOString();
  for(const lead of leads||[]){
    try{
      const conversationId=await findOperationalConversation({token,locationId:lead.ghl_location_id||locationId,contactId:lead.ghl_contact_id});
      if(!conversationId){checked++;continue}
      const messages=await getOperationalConversationMessages({token,conversationId,limit:50});
      const inbound=messages.filter((m:any)=>String(m?.direction||'').toLowerCase()==='inbound').sort((a:any,b:any)=>new Date(b?.dateAdded||0).getTime()-new Date(a?.dateAdded||0).getTime())[0];
      checked++;
      if(!inbound||new Date(inbound.dateAdded||0).getTime()<=new Date(lead.created_at).getTime())continue;
      const externalId=String(inbound.id||inbound.messageId||'');
      const {data:exists}=externalId?await db.from('outreach_events').select('id').eq('lead_id',lead.id).eq('external_id',externalId).maybeSingle():{data:null};
      if(!exists)await db.from('outreach_events').insert({lead_id:lead.id,channel:channel(inbound),event_type:'replied',provider:'highlevel',external_id:externalId||null,conversation_id:conversationId,message_key:'diagnostic_initial',metadata:{source:'highlevel_poll'}});
      await db.from('leads').update({lifecycle_stage:'conversation',last_reply_at:inbound.dateAdded||now,next_action_at:null,updated_at:now}).eq('id',lead.id);
      await db.from('businesses').update({status:'engaged',updated_at:now}).eq('id',lead.business_id);
      await db.from('automation_enrollments').update({status:'completed',next_run_at:null,completed_at:now}).eq('lead_id',lead.id).eq('track','meulocal_acquisition').eq('status','active');
      await removeOperationalTags({token,contactId:lead.ghl_contact_id,tags:['meulocal:prospectar','follow-up']}).catch(()=>undefined);
      replied++;
    }catch{}
  }
  return NextResponse.json({ok:true,checked,replied});
}
