import {getLocationAccessToken,getOperationalContact,getOperationalConversations,getOperationalConversationHistoryPage,sendOperationalMessage} from '@/lib/highlevel-operational';
export type AcquisitionIntent={leadId:string;kind:'initial'|'cadence'|'manual';step:number|null;requestId?:string;channel:'email'|'whatsapp';message:string;subject?:string};
type Stop={kind:'replied'|'opted_out';id:string;source:'provider_message'|'provider_dnd';at:string};
async function rpc(db:any,name:string,args:Record<string,unknown>){const response=await db.rpc(name,args);if(response.error)throw Error('acquisition_database_unavailable');return response.data}
export async function providerGate(payload:any,token:string,manual:boolean,budget:()=>number):Promise<Stop|null>{
 const conversations=await getOperationalConversations({token,locationId:payload.locationId,contactId:payload.contactId,timeoutMs:budget()});
 let reply:Stop|null=null;
 for(const conv of conversations){
  if(!conv?.id||conv.contactId!==payload.contactId||conv.locationId!==payload.locationId)throw Error('acquisition_history_unverified');
  let cursor:string|undefined,covered=false,lastDate=Infinity;
  const seen=new Set<string>();
  for(let page=0;page<3;page++){
   const batch=await getOperationalConversationHistoryPage({token,conversationId:conv.id,lastMessageId:cursor,timeoutMs:budget(),requirePageMetadata:true});
   for(const m of batch.messages){
    const at=Date.parse(m.dateAdded);
    if(typeof m.id!=='string'||!m.id||seen.has(m.id)||m.contactId!==payload.contactId||m.conversationId!==conv.id||(m.locationId&&m.locationId!==payload.locationId)||!Number.isFinite(at)||at>lastDate||at>Date.now()+300000||!['inbound','outbound'].includes(m.direction))throw Error('acquisition_history_unverified');
    seen.add(m.id);lastDate=at;
    if(m.direction==='inbound'){
     const stop=/^(sair|stop|cancelar|unsubscribe)$/i.test(String(m.body||'').trim());
     if(stop)return {kind:'opted_out',id:m.id,source:'provider_message',at:m.dateAdded};
     if(!manual&&!reply)reply={kind:'replied',id:m.id,source:'provider_message',at:m.dateAdded};
    }
   }
   if(!batch.hasNext){covered=true;break}
   if(!batch.lastMessageId||batch.lastMessageId===cursor)throw Error('acquisition_history_unverified');
   cursor=batch.lastMessageId;
  }
  if(!covered)throw Error('acquisition_history_unverified');
 }
 // Final provider read follows history and precedes the durable dispatch gate.
 const live=await getOperationalContact({token,contactId:payload.contactId,timeoutMs:budget()});
 const identity=payload.channel==='email'?String(live?.email||'').trim().toLowerCase():String(live?.phone||'').replace(/\D/g,'');
 if(live?.id!==payload.contactId||live.locationId!==payload.locationId||identity!==payload.recipient)throw Error('acquisition_identity_unverified');
 const dnd=operationalDnd(live,payload.channel);
 return dnd?{kind:'opted_out',id:'provider-dnd:'+payload.contactId,source:'provider_dnd',at:new Date().toISOString()}:reply;
}

/** Explicit channel settings can represent DND when the legacy global boolean is omitted.
 * Missing or malformed settings never mean permission. */
export function operationalDnd(contact:any,channel:string):boolean{
 if(contact.dnd===true||contact.tags?.includes('meulocal:opt-out'))return true;
 if(contact.dnd!==undefined&&typeof contact.dnd!=='boolean')throw Error('acquisition_dnd_unverified');
 if(contact.dndSettings!==undefined&&(contact.dndSettings===null||typeof contact.dndSettings!=='object'||Array.isArray(contact.dndSettings)))throw Error('acquisition_dnd_unverified');
 let inactive=false;
 for(const [key,value] of Object.entries(contact.dndSettings||{})){
  const normalized=key.toLowerCase().replace(/[^a-z]/g,'');
  if(normalized!==channel&&normalized!=='all')continue;
  const status=(value as {status?:unknown})?.status;
  if(status!=='active'&&status!=='inactive')throw Error('acquisition_dnd_unverified');
  if(status==='active')return true;
  if(normalized===channel)inactive=true;
 }
 if(contact.dnd===false||inactive)return false;
 throw Error('acquisition_dnd_missing');
}

/** Single provider send, fenced before transport. Unknown acceptance never retries. */
export async function deliverAcquisitionMessage(db:any,intent:AcquisitionIntent){
 const enabled=intent.kind==='manual'?process.env.MEULOCAL_MANUAL_OUTREACH_ENABLED:intent.kind==='cadence'?process.env.MEULOCAL_ACQUISITION_OUTREACH_ENABLED:process.env.MEULOCAL_PROSPECT_INITIAL_OUTREACH_ENABLED;
 if(enabled!=='true')return {ok:false,status:'outreach_disabled',processed:0,contactStarted:false};
 const deadline=Date.now()+45000,budget=()=>{const left=deadline-Date.now()-5000;if(left<1000)throw Error('acquisition_preparation_timeout');return Math.min(8000,left)};
 let job:any,started=false;
 try{
  job=await rpc(db,'reserve_acquisition_delivery',{p_lead_id:intent.leadId,p_kind:intent.kind,p_step:intent.step,p_request_id:intent.requestId||null,p_channel:intent.channel,p_message:intent.message,p_subject:intent.subject||null});
  if(!job)return {ok:false,processed:0,error:'acquisition_not_eligible_or_busy'};
  if(job.state==='sent')return {ok:true,processed:0,replayed:true,messageId:job.messageId,deliveryId:job.id};
  if(job.state!=='reserved')return {ok:false,processed:0,error:job.state==='cancelled'?'acquisition_stopped':'acquisition_reconciliation_required',deliveryId:job.id};
  const p=job.payload;
  if(!job.id||!job.lease||p?.leadId!==intent.leadId||!p.contactId||!p.locationId||!p.recipient||!['email','whatsapp'].includes(p.channel)||typeof p.message!=='string')throw Error('acquisition_reservation_unverified');
  const token=await getLocationAccessToken(p.locationId,budget());
  const stop=await providerGate(p,token,intent.kind==='manual',budget);
  if(stop){
   const saved=await rpc(db,'stop_acquisition_delivery',{p_event_id:job.id,p_lease:job.lease,p_kind:stop.kind,p_stop_id:stop.id,p_source:stop.source,p_occurred_at:stop.at});
   if(saved?.ok!==true)throw Error('acquisition_stop_not_saved');
   return {ok:true,processed:0,stopped:1,deliveryId:job.id};
  }
  budget();
  const begun=await rpc(db,'begin_acquisition_delivery',{p_event_id:job.id,p_lease:job.lease});
  if(begun?.ok!==true)throw Error('acquisition_dispatch_refused');
  started=true;
  const sent=await sendOperationalMessage({token,contactId:p.contactId,channel:p.channel,message:p.message,subject:p.subject||undefined,email:p.channel==='email'?p.recipient:undefined,timeoutMs:budget()});
  if(typeof sent.messageId!=='string'||!sent.messageId)throw Error('acquisition_receipt_missing');
  const saved=await rpc(db,'settle_acquisition_delivery',{p_event_id:job.id,p_lease:job.lease,p_message_id:sent.messageId,p_conversation_id:sent.conversationId});
  if(saved?.ok!==true)throw Error('acquisition_receipt_not_saved');
  return {ok:true,processed:1,messageId:sent.messageId,deliveryId:job.id,status:'accepted_by_highlevel'};
 }catch{
  if(job?.id&&job?.lease)try{await rpc(db,'fail_acquisition_delivery',{p_event_id:job.id,p_lease:job.lease,p_error:started?'provider_acceptance_or_receipt_unknown':'preparation_unavailable'})}catch{/* The durable lease remains authoritative. */}
  return {ok:false,processed:0,error:started?'acquisition_reconciliation_required':'acquisition_preparation_unavailable',...(job?.id?{deliveryId:job.id}:{})};
 }
}
