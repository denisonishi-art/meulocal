import {createHash} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {classifyInboundState,type InboundState} from '@/lib/agents/inbound-intent';

type Source='highlevel_webhook'|'highlevel_poll'|'highlevel_reconciliation';
type Scope={locationId:string;contactId:string};
export type LocalInboundEvent={
  external_event_id:string;legacy_event_id:string;event_type:string;ghl_location_id:string;contact_id:string;
  conversation_id:string|null;message_id:string|null;direction:string;channel:'email'|'whatsapp'|'system';
  normalized_status:string|null;classification:InboundState;kind:string;stopRequested:boolean;
  occurred_at:string|null;contact:{email:string;name:string};
  payload_meta:{source:Source;classification:InboundState;fingerprint:string};
};
function id(value:unknown):value is string{return typeof value==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(value)}
export function normalizeLocalInbound(body:any,source:Source,scope?:Scope):LocalInboundEvent {
  const locationId=body?.locationId||body?.location?.id||scope?.locationId;
  const contactId=body?.contactId||body?.contact?.id||scope?.contactId;
  if(!id(locationId)||!id(contactId)||(scope&&(locationId!==scope.locationId||contactId!==scope.contactId)))throw new Error('inbound_scope_unverified');
  const raw=body?.body??body?.message?.body??body?.message;
  const text=typeof raw==='string'?raw:'';
  const direction=String(body?.direction||body?.message?.direction||'').toLowerCase();
  const safetySignal=body?.optedOut===true||body?.dnd===true;
  const stopRequested=direction==='inbound'||safetySignal;
  const date=body?.dateAdded||body?.timestamp||body?.message?.dateAdded;
  const dateValid=typeof date==='string'&&Number.isFinite(Date.parse(date));
  const classification=direction==='inbound'&&(!date||dateValid)?classifyInboundState(text):'inconclusive';
  const status=String(body?.status||body?.message?.status||'').toLowerCase();
  const kind=stopRequested?'reply':['sent','delivered'].includes(status)?status:['failed','undelivered'].includes(status)?'failed':'observation';
  const rawId=body?.messageId||body?.message?.id||body?.id||body?.eventId;
  const legacyId=id(rawId)?rawId:createHash('sha256').update(JSON.stringify([text,date||null,kind])).digest('hex');
  const externalId=createHash('sha256').update(JSON.stringify(['meulocal-inbound-v1',locationId,contactId,legacyId,kind])).digest('hex');
  const channel=String(body?.messageType||body?.channel||body?.message?.type||'');
  const contact=body?.contact||{};
  return {external_event_id:'meulocal-inbound:'+externalId,legacy_event_id:legacyId,event_type:String(body?.type||body?.event||kind),
    ghl_location_id:locationId,contact_id:contactId,conversation_id:id(body?.conversationId||body?.conversation?.id)?body.conversationId||body.conversation.id:null,
    message_id:id(rawId)?rawId:null,direction,channel:/email/i.test(channel)?'email':/whatsapp|sms/i.test(channel)?'whatsapp':'system',
    normalized_status:status||null,classification,kind,stopRequested,occurred_at:dateValid?new Date(date).toISOString():null,
    contact:{email:typeof contact.email==='string'?contact.email.trim().toLowerCase():'',name:String(contact.companyName||contact.name||contact.firstName||contact.email||'')},
    payload_meta:{source,classification,fingerprint:createHash('sha256').update(JSON.stringify([text,kind])).digest('hex')}};
}

/** One service-only transaction handles dedup, local suppression and both domains.
 * No provider side effects. A row existing in ghl_events is not proof it was processed. */
export async function persistLocalInbound(db:SupabaseClient,event:LocalInboundEvent){
  const {data,error}=await db.rpc('apply_meulocal_inbound_event',{p_event:event});
  if(error||!data||data.pending===true||typeof data.duplicate!=='boolean'||typeof data.acquisitionFlow!=='boolean'||typeof data.customerFlow!=='boolean'||!['explicit_refusal','common_reply','inconclusive'].includes(data.state))throw new Error('inbound_persistence_failed');
  return data as {duplicate:boolean;acquisitionFlow:boolean;customerFlow:boolean;state:InboundState};
}

export async function reconcileAcquisitionMessages(db:SupabaseClient,args:{scope:Scope;messages:any[];since:string;conversationId:string;source:Source}){
  const since=Date.parse(args.since);
  if(!Number.isFinite(since)||!Array.isArray(args.messages))throw new Error('inbound_history_unverified');
  const messages=args.messages.filter(m=>String(m?.direction||'').toLowerCase()==='inbound')
    .filter(m=>!Number.isFinite(Date.parse(m?.dateAdded))||Date.parse(m.dateAdded)>since)
    .sort((a,b)=>(Date.parse(a.dateAdded)||0)-(Date.parse(b.dateAdded)||0));
  const replay=await db.rpc('replay_meulocal_inbound_events',{p_location_id:args.scope.locationId,p_contact_id:args.scope.contactId});
  if(replay.error||!Array.isArray(replay.data?.states)||replay.data.states.some((state:unknown)=>!['explicit_refusal','common_reply','inconclusive'].includes(String(state))))throw new Error('inbound_replay_failed');
  const states:InboundState[]=[...replay.data.states];
  for(const message of messages){
    const event=normalizeLocalInbound({...message,conversationId:args.conversationId},args.source,args.scope);
    const result=await persistLocalInbound(db,event);
    if(!result.acquisitionFlow)throw new Error('inbound_mapping_unverified');
    states.push(event.classification);
  }
  return {stopped:states.length>0,states};
}
