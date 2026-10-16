import {getLocationAccessToken,findOperationalConversation,getOperationalConversationMessages,getOperationalMessage,getOperationalContact} from './highlevel-operational';

export const CONTROLLED_LOCATION_ID='uNh3KsM7WFuLeTN8Q583';
export const CONTROLLED_CONTACT_ID='SdJ2oWZqsReI1TTq4cAd';
export const CONTROLLED_WORKFLOW_ID='957c3d55-c64c-4b84-88a6-1808c587f450';
export class ControlledInboundError extends Error{
 constructor(message:string,public status=400){super(message)}
}
const text=(value:unknown)=>typeof value==='string'?value.trim():'';

/** Bind to an immutable provider ID or the triggering message timestamp, never execution time. */
export async function resolveControlledInbound(body:any,options:{requireControlledTag?:boolean}={}){
 const custom=body?.customData&&typeof body.customData==='object'&&!Array.isArray(body.customData)?body.customData:{};
 const locationId=text(custom.locationId)||text(body.locationId)||text(body.location?.id);
 const contactId=text(custom.contactId)||text(body.contactId)||text(body.contact_id)||text(body.contact?.id);
 const message=text(custom.body)||text(body.body)||text(body.message?.body);
 const direction=text(custom.direction)||text(body.direction)||text(body.message?.direction);
 if(!locationId||!contactId||!message||message.length>4000||direction!=='inbound')throw new ControlledInboundError('invalid_controlled_inbound');
 for(const value of [body.locationId,body.location?.id,custom.locationId])if(text(value)&&text(value)!==locationId)throw new ControlledInboundError('location_conflict');
 for(const value of [body.contactId,body.contact_id,body.contact?.id,custom.contactId])if(text(value)&&text(value)!==contactId)throw new ControlledInboundError('contact_conflict');
 if(text(body.message?.direction)&&body.message.direction!=='inbound')throw new ControlledInboundError('direction_conflict');
 if(locationId!==CONTROLLED_LOCATION_ID||contactId!==CONTROLLED_CONTACT_ID)throw new ControlledInboundError('controlled_scope_not_authorized',409);
 const ids=[custom.messageId,body.messageId,body.message?.id].map(text).filter(Boolean);
 const times=[custom.messageOccurredAt,body.timestamp,body.dateAdded,body.message?.dateAdded].map(text).filter(Boolean);
 if(new Set(ids).size>1)throw new ControlledInboundError('message_id_conflict');
 // Require timezone and full time; dates and local execution timestamps are not anchors.
 if(times.some(t=>!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(t)||!Number.isFinite(Date.parse(t))))throw new ControlledInboundError('invalid_message_timestamp');
 if(new Set(times.map(t=>Date.parse(t))).size>1)throw new ControlledInboundError('message_timestamp_conflict');
 const requestedId=ids[0],occurredAt=times.length?Date.parse(times[0]):null;
 if(!requestedId&&occurredAt===null)throw new ControlledInboundError('identity_anchor_missing',422);
 const token=await getLocationAccessToken(locationId);
 if(options.requireControlledTag){
  const contact=await getOperationalContact({token,contactId});
  if(locationId!==CONTROLLED_LOCATION_ID||contactId!==CONTROLLED_CONTACT_ID||contact?.id!==contactId||contact?.locationId!==locationId||!contact?.tags?.includes('controlled-contact'))throw new ControlledInboundError('controlled_native_scope_unverified',409);
 }
 const conversationId=await findOperationalConversation({token,locationId,contactId});
 if(!conversationId)throw new ControlledInboundError('message_identity_unverified',409);
 const messages=requestedId?[await getOperationalMessage({token,messageId:requestedId,conversationId})]:await getOperationalConversationMessages({token,conversationId,limit:50});
 const candidates=messages.filter((item:any)=>{
  const at=Date.parse(item?.dateAdded);
  return typeof item?.id==='string'&&item.contactId===contactId&&item.conversationId===conversationId&&
   (!item.locationId||item.locationId===locationId)&&item.direction==='inbound'&&
   (item.messageType==='TYPE_WHATSAPP'||item.type===19)&&text(item.body)===message&&
   Number.isFinite(at)&&(!requestedId||item.id===requestedId)&&(occurredAt===null||at===occurredAt);
 });
 const unique=new Map<string,any>(candidates.map((item:any)=>[item.id,item]));
 if(unique.size!==1)throw new ControlledInboundError(unique.size?'message_identity_ambiguous':'message_identity_unverified',409);
 const verified=Array.from(unique.values())[0];
 return {...body,id:verified.id,eventId:verified.id,messageId:verified.id,locationId,contactId,conversationId,
  type:'InboundMessage',direction:'inbound',channel:'WhatsApp',messageType:'WhatsApp',body:message,
  timestamp:verified.dateAdded,message:{...body.message,id:verified.id,body:message,direction:'inbound',type:'WhatsApp'}};
}
