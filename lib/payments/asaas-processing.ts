import {getAsaasCustomerEmail} from './asaas';
import {sharedLinkForEvent} from './plans';
import {ensureCustomerUser,findCustomerUser} from './customer-user';
import {paidAsaasEvents,supportedAsaasEvents,normalizePayerEmail} from './asaas-event';

const knownErrors=['payment_existing_contract','payment_event_payload_conflict','legacy_payment_reconciliation_required','payment_checkout_not_matched','payment_payer_email_required','payment_payer_email_conflict','payment_payer_business_ambiguous','payment_checkout_ambiguous','payment_checkout_scope_conflict','payment_subscription_superseded','payment_checkout_plan_conflict','payment_amount_unverified','payment_status_unverified','payment_checkout_anchor_required','payment_provider_binding_conflict','payment_user_scope_conflict','payment_activation_lease_expired','customer_user_lookup_failed','customer_user_pagination_unverified','customer_user_creation_unverified','customer_invitation_reconciliation_required'];
const operationalErrors=['payment_database_unavailable','payment_receipt_save_failed','customer_user_lookup_budget_exhausted','customer_email_invalid'];
function code(error:any,fallback:string){const message=String(error?.message||error);return [...knownErrors,...operationalErrors].find(value=>message.includes(value))||fallback}
async function rpc(db:any,name:string,args:any){const result=await db.rpc(name,args);if(result.error)throw Error(code(result.error,'payment_database_unavailable'));return result.data}
function completed(record:any){return {ok:true,stored:true,eventId:record.external_event_id,processing:'completed',duplicate:record.duplicate===true,...(record.activation_outcome==='ignored'?{ignored:true}:{}) ,httpStatus:200}}

/** A recovery caller may link verified users, but cannot issue a new invitation by default. */
export async function processStoredAsaasEvent(db:any,record:any,{allowInvite=false}:{allowInvite?:boolean}={}){
 let lease:string|undefined;
 try{
  if(record.activation_state==='completed')return completed(record);
  if(record.activation_state==='legacy')throw Error('legacy_payment_reconciliation_required');
  const event=record.payload;
  if(!supportedAsaasEvents.has(event.eventType)){
   if(!await rpc(db,'ignore_payment_event',{p_event_id:record.id,p_reason:'unsupported_event'}))throw Error('payment_receipt_save_failed');
   return {...completed(record),ignored:true};
  }
  if(event.eventType.startsWith('CHECKOUT_')){
   await rpc(db,'bind_payment_checkout_event',{p_event_id:record.id});
   if(event.eventType==='CHECKOUT_CREATED')return completed(record);
  }
  let resolved:any;
  try{resolved=await rpc(db,'resolve_payment_checkout',{p_event_id:record.id,p_shared_link_id:sharedLinkForEvent(event.paymentLink),p_payer_email:record.resolved_customer_email||event.payerEmail})}
  catch(error){
   if(code(error,'')!=='payment_payer_email_required'||!event.customerId)throw error;
   const email=normalizePayerEmail(await getAsaasCustomerEmail(event.customerId));
   if(!email)throw Error('payment_payer_email_required');
   resolved=await rpc(db,'resolve_payment_checkout',{p_event_id:record.id,p_shared_link_id:sharedLinkForEvent(event.paymentLink),p_payer_email:email});
  }
  if(resolved?.ignored){
   if(!await rpc(db,'ignore_payment_event',{p_event_id:record.id,p_reason:resolved.reason}))throw Error('payment_receipt_save_failed');
   return {...completed(record),ignored:true};
  }
  if(!resolved?.checkoutId)throw Error('payment_checkout_not_matched');
  if(!paidAsaasEvents.has(event.eventType)){
   const saved=await rpc(db,'apply_payment_status',{p_event_id:record.id,p_checkout_id:resolved.checkoutId});
   if(!saved)return {ok:false,stored:true,processing:'leased',httpStatus:202};
   return completed(record);
  }
  const job=await rpc(db,'claim_payment_activation',{p_event_id:record.id,p_checkout_id:resolved.checkoutId,p_shared_link_id:sharedLinkForEvent(event.paymentLink)});
  if(!job)return {ok:false,stored:true,processing:'leased_or_backoff',httpStatus:202};
  if(job.state==='completed')return completed({...record,duplicate:true});
  if(!job.lease||job.account?.business_id!==job.checkout?.business_id||job.account?.id!==job.checkout?.customer_account_id)throw Error('payment_checkout_scope_conflict');
  lease=job.lease;
  let userId=job.account.user_id,status:'linked'|'invited'='linked';
  if(!userId){
   const email=job.checkout.customer_email;
   if(typeof email!=='string'||!email)throw Error('payment_payer_email_required');
   if(!allowInvite){const user=await findCustomerUser(db,email);if(!user)throw Error('customer_invitation_reconciliation_required');userId=user.id}
   else{
    const appUrl=(process.env.NEXT_PUBLIC_APP_URL||'https://meulocal.ia.br').replace(/\/$/,'');
    const access=await ensureCustomerUser(db,email,appUrl+'/login?reset=1',async()=>Boolean(await rpc(db,'authorize_payment_invitation',{p_event_id:record.id,p_lease:lease,p_email:email})));
    userId=access.user.id;status=access.status;
   }
  }
  if(!await rpc(db,'complete_payment_activation',{p_event_id:record.id,p_lease:lease,p_user_id:userId,p_activation_status:status}))throw Error('payment_receipt_save_failed');
  console.info(JSON.stringify({stage:'payment_activation_saved',eventId:record.external_event_id,checkoutId:resolved.checkoutId,invited:status==='invited'}));
  return completed(record);
 }catch(error){
  const reason=code(error,'payment_processing_unavailable');
  try{if(lease)await rpc(db,'release_payment_activation',{p_event_id:record.id,p_lease:lease,p_error:reason});else await rpc(db,'defer_payment_event',{p_event_id:record.id,p_error:reason})}catch{/* The journal and an expiring lease still survive an unavailable database. */}
  const conflict=['payment_existing_contract','payment_event_payload_conflict','legacy_payment_reconciliation_required','payment_checkout_plan_conflict','payment_amount_unverified','payment_status_unverified','payment_checkout_scope_conflict','payment_subscription_superseded','payment_provider_binding_conflict'].includes(reason);
  return {ok:false,stored:true,eventId:record.external_event_id,error:reason,httpStatus:conflict?409:503};
 }
}

export async function acceptAsaasEvent(db:any,event:any){
 let record:any;
 try{record=await rpc(db,'receive_asaas_event',{p_event:event})}
 catch(error){const reason=code(error,'payment_event_storage_failed');return {ok:false,error:reason,httpStatus:['payment_event_payload_conflict','legacy_payment_reconciliation_required'].includes(reason)?409:503}}
 if(!record?.id)return {ok:false,error:'payment_event_storage_failed',httpStatus:503};
 return processStoredAsaasEvent(db,record,{allowInvite:true});
}

/** Bounded read-only selection; activation uses the same leases and never enables new invitations. */
export async function recoverAsaasEvents(db:any){
 try{
  const {data:events,error}=await db.from('payment_events').select('*').eq('provider','asaas').in('activation_state',['pending','processing']).lte('activation_available_at',new Date().toISOString()).order('activation_available_at').order('created_at').limit(1);
  if(error)return {ok:false,error:'payment_recovery_read_failed',completed:0,pending:0};
  let completed=0,pending=0,requiresHumanReview=0;
  for(const event of events||[]){
   const result=await processStoredAsaasEvent(db,event);
   if(result.ok)completed++;else{pending++;const reason='error' in result?result.error:undefined;if(reason==='customer_invitation_reconciliation_required'||reason==='customer_user_creation_unverified')requiresHumanReview++}
  }
  return {ok:pending===0,completed,pending,requiresHumanReview,...(pending?{error:'payment_activation_pending'}:{})};
 }catch{return {ok:false,error:'payment_recovery_unavailable',completed:0,pending:0}}
}
