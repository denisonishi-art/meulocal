import {getLocationAccessToken,removeOperationalTags} from '../highlevel-operational';
import {deliverOpenDotsEvent} from './opendots-commercial-bridge';

/** Only service-role callers can claim or settle jobs. The database owns leases and scope. */
export async function deliverOpenDotsJob(db:any,eventId:string){
 const {data:job,error}=await db.rpc('claim_opendots_handoff',{p_event_id:eventId});
 if(error)return {ok:false,error:'handoff_claim_failed'};
 if(!job)return {ok:false,error:'handoff_busy'};
 if(job.state==='completed')return {ok:true,openDots:job.receipt};
 const receipt=job.receipt?.status==='decision_saved'?job.receipt:await deliverOpenDotsEvent(job.payload);
 let cleanupDone=job.cleanup_done||job.payload.kind==='meulocal.customer.lifecycle';
 if(!cleanupDone){
  try{const token=await getLocationAccessToken(job.payload.locationId);await removeOperationalTags({token,contactId:job.payload.contactId,tags:['meulocal:prospectar','follow-up']});cleanupDone=true}catch{}
 }

 const {data:settled,error:saveError}=await db.rpc('settle_opendots_handoff',{p_event_id:eventId,p_lease:job.lease_token,p_receipt:receipt,p_cleanup_done:cleanupDone});
 if(saveError||!settled)return {ok:false,error:'handoff_receipt_persistence_failed',openDots:receipt};
 return {ok:receipt.status==='decision_saved'&&cleanupDone,openDots:receipt,...(!cleanupDone?{error:'operational_tag_cleanup_pending'}:{})};
}
export async function drainOpenDotsOutbox(db:any){
 const {data:jobs,error}=await db.from('opendots_handoffs').select('event_id').in('state',['pending','processing']).lte('available_at',new Date().toISOString()).order('created_at').limit(2);
 if(error)return {ok:false,error:'handoff_queue_read_failed'};
 let completed=0,pending=0;
 for(const job of jobs||[]){const result=await deliverOpenDotsJob(db,job.event_id);if(result.ok)completed++;else pending++;}
 return {ok:pending===0,completed,pending};
}
export async function processControlledInbound(db:any,row:any,body:any){
 const {data:prepared,error}=await db.rpc('prepare_controlled_inbound',{p_row:row,p_message:String(body.body),p_occurred_at:body.timestamp});
 if(error)return {ok:false,error:'controlled_prepare_failed',httpStatus:503};
 if(prepared.error)return {ok:false,error:prepared.error,httpStatus:409};
 if(prepared.state==='completed')return {ok:true,eventId:row.external_event_id,openDots:prepared.receipt,httpStatus:200};
 const result=await deliverOpenDotsJob(db,row.external_event_id);
 console.info(JSON.stringify({stage:'controlled_handoff',eventId:row.external_event_id,ok:result.ok,status:('openDots' in result?result.openDots?.status:null)||result.error}));
 return {...result,eventId:row.external_event_id,messageId:row.message_id,httpStatus:result.ok?200:503};
}
