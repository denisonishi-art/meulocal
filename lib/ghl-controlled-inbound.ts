import {getLocationAccessToken,findOperationalConversation,getOperationalConversationMessages} from './highlevel-operational';

export const CONTROLLED_WORKFLOW_ID='957c3d55-c64c-4b84-88a6-1808c587f450';
export class ControlledInboundError extends Error{
 constructor(message:string,public status=400){super(message)}
}
const text=(value:unknown)=>typeof value==='string'?value.trim():'';

/** Workflow customData does not include a supported message-ID merge value.
 * Resolve only an unambiguous recent real inbound, using existing read APIs.
 * No writes, import, send, or arbitrary latest-message substitution. */
export async function resolveControlledInbound(body:any){
 const custom=body?.customData&&typeof body.customData==='object'&&!Array.isArray(body.customData)?body.customData:{};
 const locationId=text(custom.locationId)||text(body.locationId)||text(body.location?.id);
 const contactId=text(custom.contactId)||text(body.contactId)||text(body.contact_id)||text(body.contact?.id);
 const message=text(custom.body)||text(body.body)||text(body.message?.body);
 const direction=text(custom.direction)||text(body.direction)||text(body.message?.direction);
 if(!locationId||!contactId||!message||message.length>4000||direction!=='inbound')throw new ControlledInboundError('invalid_controlled_inbound');
 for(const value of [body.locationId,body.location?.id,custom.locationId])if(text(value)&&text(value)!==locationId)throw new ControlledInboundError('location_conflict');
 for(const value of [body.contactId,body.contact_id,body.contact?.id,custom.contactId])if(text(value)&&text(value)!==contactId)throw new ControlledInboundError('contact_conflict');
 if(text(body.message?.direction)&&body.message.direction!=='inbound')throw new ControlledInboundError('direction_conflict');
 const token=await getLocationAccessToken(locationId);
 const conversationId=await findOperationalConversation({token,locationId,contactId});
 if(!conversationId)throw new ControlledInboundError('message_identity_unverified',409);
 const messages=await getOperationalConversationMessages({token,conversationId,limit:50});
 const requestedId=text(custom.messageId)||text(body.messageId)||text(body.message?.id);
 const now=Date.now();
 const candidates=messages.filter((item:any)=>{
  const at=Date.parse(item.dateAdded);
  return typeof item.id==='string'&&item.contactId===contactId&&item.conversationId===conversationId&&item.direction==='inbound'&&
   (item.messageType==='TYPE_WHATSAPP'||item.type===19)&&text(item.body)===message&&
   Number.isFinite(at)&&now-at<=15*60*1000&&at-now<=30000&&(!requestedId||item.id===requestedId);
 });
 const unique=new Map<string,any>(candidates.map((item:any)=>[item.id,item]));
 if(unique.size!==1)throw new ControlledInboundError(unique.size?'message_identity_ambiguous':'message_identity_unverified',409);
 const verified=Array.from(unique.values())[0];
 return {...body,id:verified.id,eventId:verified.id,messageId:verified.id,locationId,contactId,conversationId,
  type:'InboundMessage',direction:'inbound',channel:'WhatsApp',messageType:'WhatsApp',body:message,
  timestamp:verified.dateAdded,message:{...body.message,id:verified.id,body:message,direction:'inbound',type:'WhatsApp'}};
}
