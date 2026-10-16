import {CONTROLLED_CONTACT_ID,CONTROLLED_LOCATION_ID,CONTROLLED_WORKFLOW_ID} from './ghl-controlled-inbound';
import {getLocationAccessToken,getOperationalContact,getOperationalConversationHistoryPage} from './highlevel-operational';

/** A workflow notification is a wakeup, never the identity/content of a message. */
export function isControlledInboxWakeup(body:any):boolean {
 const custom=body?.customData||{};
 const locations=[body?.locationId,body?.location?.id,custom.locationId].filter(x=>x!==undefined&&x!==null);
 const contacts=[body?.contactId,body?.contact_id,body?.contact?.id,custom.contactId].filter(x=>x!==undefined&&x!==null);
 const directions=[body?.direction,body?.message?.direction,custom.direction].filter(x=>x!==undefined&&x!==null);
 return body?.workflow?.id===CONTROLLED_WORKFLOW_ID&&locations.length>0&&contacts.length>0&&directions.length>0&&
  locations.every(x=>x===CONTROLLED_LOCATION_ID)&&contacts.every(x=>x===CONTROLLED_CONTACT_ID)&&directions.every(x=>x==='inbound');
}

/** Read through the exact persisted cursor before writing any newly discovered message. */
export async function reconcileControlledInbox(db:any) {
 let lease:string|undefined;
 try {
  const token=await getLocationAccessToken(CONTROLLED_LOCATION_ID);
  const contact=await getOperationalContact({token,contactId:CONTROLLED_CONTACT_ID});
  if(contact?.id!==CONTROLLED_CONTACT_ID||contact?.locationId!==CONTROLLED_LOCATION_ID||!contact?.tags?.includes('controlled-contact'))return {ok:false,error:'controlled_scope_unverified'};
  const claimed=await db.rpc('claim_controlled_inbox',{p_location_id:CONTROLLED_LOCATION_ID,p_contact_id:CONTROLLED_CONTACT_ID});
  if(claimed.error)return {ok:false,error:'inbox_claim_failed'};
  const cursor=claimed.data;
  if(!cursor)return {ok:true,busy:true,ingested:0};
  if(cursor.error)return {ok:false,error:cursor.error};
  lease=cursor.lease_token;
  if(!lease||cursor.location_id!==CONTROLLED_LOCATION_ID||cursor.contact_id!==CONTROLLED_CONTACT_ID||!cursor.conversation_id||!cursor.cursor_message_id)throw Error('cursor_scope_unverified');
  const unseen=new Map<string,any>();let found=false;let after:string|undefined;
  const deadline=Date.now()+20000;
  for(let page=0;page<5;page++){
   const remaining=deadline-Date.now();if(remaining<=0)throw Error('history_budget_exhausted');
   const batch=await getOperationalConversationHistoryPage({token,conversationId:cursor.conversation_id,lastMessageId:after,timeoutMs:Math.min(10000,remaining)});
   if(!Array.isArray(batch.messages))throw Error('invalid_history_page');
   for(const item of batch.messages){
    if(typeof item?.id!=='string'||!item.id||item.contactId!==CONTROLLED_CONTACT_ID||item.conversationId!==cursor.conversation_id||(item.locationId&&item.locationId!==CONTROLLED_LOCATION_ID)||typeof item.dateAdded!=='string'||!Number.isFinite(Date.parse(item.dateAdded))||(item.body!=null&&typeof item.body!=='string'))throw Error('history_scope_unverified');
    if(item.id===cursor.cursor_message_id){found=true;break}
    const prior=unseen.get(item.id);
    if(prior&&JSON.stringify(prior)!==JSON.stringify(item))throw Error('history_payload_conflict');
    if(!prior)unseen.set(item.id,item);
   }
   if(found)break;
   if(!batch.hasNext)break;
   if(!batch.lastMessageId||batch.lastMessageId===after)throw Error('history_pagination_invalid');
   after=batch.lastMessageId;
  }
  if(!found)throw Error('cursor_anchor_not_found');
  const messages=Array.from(unseen.values()).reverse();
  if(!messages.length){
   const released=await db.rpc('release_controlled_inbox',{p_lease:lease,p_error:null});
   if(released.error||!released.data)throw Error('inbox_release_failed');
   return {ok:true,ingested:0,ignored:0};
  }
  const saved=await db.rpc('ingest_controlled_inbox_batch',{p_lease:lease,p_messages:messages});
  if(saved.error||!saved.data||saved.data.error)throw Error('inbox_ingest_failed');
  return {ok:true,ingested:saved.data.ingested,ignored:saved.data.ignored,eventIds:messages.map(item=>item.id)};
 } catch(error) {
  const known=['controlled_scope_unverified','cursor_scope_unverified','history_budget_exhausted','invalid_history_page','history_scope_unverified','history_payload_conflict','history_pagination_invalid','cursor_anchor_not_found','inbox_ingest_failed','inbox_release_failed'];
  const code=error instanceof Error&&known.includes(error.message)?error.message:'inbox_provider_unavailable';
  if(lease){try{await db.rpc('release_controlled_inbox',{p_lease:lease,p_error:code})}catch{/* Expiring lease remains recoverable if the database is unavailable. */}}
  return {ok:false,error:code};
 }
}
