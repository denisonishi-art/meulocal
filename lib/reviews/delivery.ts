import {createHash} from 'node:crypto';
import {getLocationAccessToken,getOperationalContact,getOperationalConversations,getOperationalConversationHistoryPage,sendOperationalMessage,upsertOperationalContact} from '@/lib/highlevel-operational';

type Stop={type:'replied'|'opted_out';id:string};
const explicitStop=(text:unknown)=>typeof text==='string'&&/^(sair|stop|cancelar|unsubscribe)$/i.test(text.trim());
const phone=(value:unknown)=>String(value||'').replace(/\D/g,'');
const mail=(value:unknown)=>String(value||'').trim().toLowerCase();

function messageFor(attempt:number,businessName:string,customerName:string,reviewUrl:string){
 const first=customerName?customerName.trim().split(/\s+/)[0]:'';
 const hello=first?'Olá, '+first+'!':'Olá!';
 if(attempt===1)return hello+' Aqui é a '+businessName+'. Como foi sua experiência com a gente?\n\nSe puder, deixe sua avaliação no Google. Leva menos de um minuto:\n'+reviewUrl+'\n\nSe não quiser receber novas mensagens, responda SAIR.';
 if(attempt===2)return hello+' Passando só para lembrar do nosso pedido de avaliação da '+businessName+'. Sua opinião ajuda muito outras pessoas a conhecerem nosso trabalho:\n'+reviewUrl+'\n\nSe não quiser receber novas mensagens, responda SAIR.';
 return hello+' Este é nosso último lembrete. Se tiver um minuto, conte como foi sua experiência com a '+businessName+' no Google:\n'+reviewUrl+'\n\nObrigado! Se não quiser receber novas mensagens, responda SAIR.';
}

async function rpc(db:any,name:string,args:Record<string,unknown>={}){
 const result=await db.rpc(name,args);
 if(result.error)throw Error('review_database_unavailable');
 return result.data;
}
async function historyStop(job:any,token:string,locationId:string,contactId:string,budget:()=>number):Promise<Stop|null>{
 const baseline=Date.parse(job.activatedAt);
 if(!Number.isFinite(baseline)||baseline>Date.now())throw Error('review_history_unverified');
 const conversations=await getOperationalConversations({token,locationId,contactId,timeoutMs:budget()});
 for(const conv of conversations){
  if(typeof conv?.id!=='string'||conv.contactId!==contactId||conv.locationId!==locationId)throw Error('review_history_unverified');
  let cursor:string|undefined,covered=false,lastDate=Infinity;
  for(let page=0;page<3;page++){
   const batch=await getOperationalConversationHistoryPage({token,conversationId:conv.id,lastMessageId:cursor,timeoutMs:budget(),requirePageMetadata:true});
   for(const message of batch.messages){
    const at=Date.parse(message.dateAdded);
    if(typeof message.id!=='string'||!message.id||message.contactId!==contactId||message.conversationId!==conv.id||
     (message.locationId&&message.locationId!==locationId)||!Number.isFinite(at)||at>lastDate||at>Date.now()+300000||!['inbound','outbound'].includes(message.direction))throw Error('review_history_unverified');
    lastDate=at;
    if(message.direction==='inbound'&&explicitStop(message.body))return {type:'opted_out',id:message.id};
    if(at<baseline){covered=true;break}
    if(message.direction==='inbound')return {type:'replied',id:message.id};
   }
   if(covered||!batch.hasNext){covered=true;break}
   if(!batch.lastMessageId||batch.lastMessageId===cursor)throw Error('review_history_unverified');
   cursor=batch.lastMessageId;
  }
  if(!covered)throw Error('review_history_unverified');
 }
 return null;
}

/** At most one provider request per invocation. All authority is durable in PostgreSQL. */
export async function processNextReviewDelivery(db:any){
 if(process.env.MEULOCAL_REVIEW_OUTREACH_ENABLED!=='true')return {ok:true,enabled:false,processed:0,pending:0,blocked:0};
 const deadline=Date.now()+45000;
 const budget=()=>{const remaining=deadline-Date.now()-5000;if(remaining<1000)throw Error('review_preparation_timeout');return Math.min(8000,remaining)};
 const result=async(base:Record<string,any>)=>{
  try{
   const health=await rpc(db,'review_delivery_health');
   if(!Number.isSafeInteger(health?.pending)||!Number.isSafeInteger(health?.blocked))throw Error('unverified_health');
   return {...base,enabled:true,pending:health.pending,blocked:health.blocked,ok:base.ok===true&&health.blocked===0,...(health.blocked&&!base.error?{error:'review_reconciliation_required'}:{})};
  }catch{return {...base,enabled:true,ok:false,error:'review_health_unavailable'}}
 };
 let job:any,dispatchStarted=false,accepted=false;
 try{
  job=await rpc(db,'claim_next_review_delivery');
  if(!job)return result({ok:true,processed:0,idle:true});
  if(!job.id||!job.lease||!job.businessId||!job.contact?.id)throw Error('review_job_unverified');
  const [business,location,connection]=await Promise.all([
   db.from('businesses').select('id,name,google_place_id').eq('id',job.businessId).maybeSingle(),
   db.from('ghl_locations').select('ghl_location_id').eq('business_id',job.businessId).eq('lifecycle_status','active').maybeSingle(),
   db.from('google_business_connections').select('google_review_url,google_place_id').eq('business_id',job.businessId).eq('status','connected').maybeSingle(),
  ]);
  if(business.error||location.error||connection.error||!business.data?.name||!location.data?.ghl_location_id)throw Error('review_infrastructure_unavailable');
  const reviewUrl=connection.data?.google_review_url||((connection.data?.google_place_id||business.data.google_place_id)?'https://search.google.com/local/writereview?placeid='+encodeURIComponent(connection.data?.google_place_id||business.data.google_place_id):null);
  const destination=reviewUrl?new URL(reviewUrl):null;
  if(!destination||destination.protocol!=='https:'||!(destination.hostname==='google.com'||destination.hostname.endsWith('.google.com')))throw Error('review_destination_unavailable');
  const locationId=location.data.ghl_location_id;
  if(job.contact.ghlLocationId&&job.contact.ghlLocationId!==locationId)throw Error('review_provider_scope_unverified');
  const token=await getLocationAccessToken(locationId,budget());
  const channel=job.contact.whatsapp?'whatsapp':job.contact.email?'email':null;
  if(!channel)throw Error('review_channel_unavailable');
  let contactId=job.contact.ghlContactId;
  if(!contactId){const upserted=await upsertOperationalContact({token,locationId,name:job.contact.name,email:job.contact.email,phone:job.contact.whatsapp,timeoutMs:budget()});contactId=upserted.id}
  const stop=await historyStop(job,token,locationId,contactId,budget);
  // Fresh read after history, immediately before durable dispatch authorization.
  const live=await getOperationalContact({token,contactId,timeoutMs:budget()});
  if(live?.id!==contactId||live.locationId!==locationId||typeof live.dnd!=='boolean'||
   (channel==='whatsapp'?phone(live.phone)!==phone(job.contact.whatsapp):mail(live.email)!==mail(job.contact.email)))throw Error('review_provider_scope_unverified');
  const channelDnd=live.dndSettings?.[channel==='whatsapp'?'WhatsApp':'Email']?.status;
  if(channelDnd!==undefined&&!['active','inactive'].includes(channelDnd))throw Error('review_provider_scope_unverified');
  const finalStop:Stop|null=live.dnd||channelDnd==='active'?{type:'opted_out',id:'provider-dnd:'+contactId}:stop;
  if(finalStop){
   const stopped=await rpc(db,'stop_review_contact',{p_business_id:job.businessId,p_contact_id:job.contact.id,p_type:finalStop.type,p_message_id:finalStop.id,p_channel:channel});
   if(stopped?.ok!==true)throw Error('review_stop_unverified');
   return result({ok:true,processed:0,stopped:1,deliveryId:job.id});
  }
  const message=messageFor(job.attempt,business.data.name,job.contact.name||'',destination.href);
  const contentHash=createHash('sha256').update(JSON.stringify({contactId,locationId,channel,message})).digest('hex');
  budget();
  const begun=await rpc(db,'begin_review_delivery',{p_delivery_id:job.id,p_lease:job.lease,p_contact_id:contactId,p_location_id:locationId,p_channel:channel,p_content_hash:contentHash});
  if(begun?.ok!==true)throw Error('review_dispatch_refused');
  dispatchStarted=true;
  // No retry and no second channel: any uncertain acceptance requires reconciliation.
  const sent=await sendOperationalMessage({token,contactId,channel,message,subject:'Como foi sua experiência?',email:job.contact.email,timeoutMs:budget()});
  if(typeof sent.messageId!=='string'||!sent.messageId)throw Error('review_receipt_missing');
  accepted=true;
  const saved=await rpc(db,'settle_review_delivery',{p_delivery_id:job.id,p_lease:job.lease,p_message_id:sent.messageId,p_conversation_id:sent.conversationId});
  if(saved?.ok!==true)throw Error('review_receipt_not_saved');
  return result({ok:true,processed:1,deliveryId:job.id});
 }catch{
  if(job?.id&&job?.lease){try{await rpc(db,'fail_review_delivery',{p_delivery_id:job.id,p_lease:job.lease,p_error:dispatchStarted?(accepted?'receipt_not_saved':'provider_response_unknown'):'preparation_unavailable'})}catch{/* Durable lease remains authoritative when the database is unavailable. */}}
  return result({ok:false,processed:0,...(job?.id?{deliveryId:job.id}:{}),error:dispatchStarted?'review_reconciliation_required':'review_preparation_unavailable'});
 }
}
