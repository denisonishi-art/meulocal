const API='https://services.leadconnectorhq.com';

/** Gated GHL send. Inert unless MEULOCAL_AUTO_REPLY_ENABLED==='true' AND GHL_API_KEY is set.
 * The full guard (providerGate, DND settings, consent, durable lease) lives in the MeuLocal app
 * (lib/acquisition/delivery.ts); this module is the worker-side first line of defense only. */
export function canDispatch(){
  return process.env.MEULOCAL_AUTO_REPLY_ENABLED==='true' && Boolean(process.env.GHL_API_KEY);
}

/** Controlled-E2E allowlist: when MEULOCAL_E2E_ALLOWED_CONTACTS is set (comma-separated GHL
 * contact IDs), dispatch is restricted to ONLY those contacts, independent of canDispatch().
 * This lets the whole pipe be enabled for a single authorized test contact without opening
 * commercial sends to any other prospect. Unset = no additional restriction (normal operation). */
export function contactAllowedForDispatch(contactId){
  const raw=process.env.MEULOCAL_E2E_ALLOWED_CONTACTS;
  if(!raw||!raw.trim())return true;
  const allowed=raw.split(',').map(s=>s.trim()).filter(Boolean);
  return allowed.includes(String(contactId));
}

/** Test-contact isolation: the worker only auto-replies to contacts carrying the isolation
 * tag (default 'meulocal:hermes-auto'). The Conversation AI must be configured (UI, by the
 * operator) to skip contacts with this same tag — the tag is the coordination point that
 * guarantees exactly ONE auto-responder per conversation. */
export function contactIsolatedForHermes(contact){
  const tag=process.env.MEULOCAL_HERMES_HANDLED_TAG||'meulocal:hermes-auto';
  return Array.isArray(contact.tags)&&contact.tags.includes(tag);
}

export async function readContactForSend({token,locationId,contactId,fetchImpl=fetch}){
  const res=await fetchImpl(API+'/contacts/'+encodeURIComponent(contactId),{headers:{Authorization:'Bearer '+token,Accept:'application/json',Version:'2021-07-28'}});
  if(!res.ok)throw Error('ghl_contact_read_'+res.status);
  const data=await res.json();
  const contact=data?.contact;
  if(!contact||contact.locationId!==locationId||contact.id!==contactId)throw Error('contact_identity_unverified');
  return contact;
}

/** Fail-closed consent + channel-eligibility gate. An absent or non-boolean DND flag, a DND
 * flag, an opt-out tag, or a channel whose required field is missing/inconsistent all BLOCK. */
export function contactBlocked(contact,channel){
  if(typeof contact.dnd!=='boolean')return {blocked:true,reason:'dnd_unverified'};
  if(contact.dnd===true)return {blocked:true,reason:'dnd'};
  if(Array.isArray(contact.tags)&&contact.tags.includes('meulocal:opt-out'))return {blocked:true,reason:'opt_out'};
  if(channel==='whatsapp'&&(typeof contact.phone!=='string'||!contact.phone.trim()))return {blocked:true,reason:'whatsapp_channel_not_eligible'};
  if(channel==='email'&&(typeof contact.email!=='string'||!contact.email.trim()))return {blocked:true,reason:'email_channel_not_eligible'};
  return {blocked:false};
}

export async function sendGhlResponse({token,contactId,channel,message,subject,fetchImpl=fetch}){
  const type=channel==='whatsapp'?'WhatsApp':'Email';
  const payload={type,contactId,message};
  if(type==='Email'){
    payload.subject=subject||'MeuLocal';
    payload.html='<p>'+String(message).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;').replace(/\n/g,'<br/>')+'</p>';
  }
  const res=await fetchImpl(API+'/conversations/messages',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Version:'2021-07-28'},body:JSON.stringify(payload)});
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw Error('ghl_send_'+res.status);
  return {messageId:data?.messageId||data?.id||null,conversationId:data?.conversationId||null};
}

/** Reconcile an uncertain send: after a crash between GHL acceptance and receipt persistence,
 * the ledger holds an 'intent'. Query the contact's conversation history for an OUTBOUND
 * message matching the exact content at-or-after the intent timestamp. Returns {found,...}
 * or {found:false}; "not found" is never treated as "sent". */
export async function reconcileSentMessage({token,locationId,contactId,message,since,fetchImpl=fetch}){
  const v3={Authorization:'Bearer '+token,Accept:'application/json',Version:'v3'};
  const convRes=await fetchImpl(API+'/conversations/search?'+new URLSearchParams({locationId,contactId,limit:'20',sort:'desc'}).toString(),{headers:v3});
  if(!convRes.ok)throw Error('ghl_conv_search_'+convRes.status);
  const convData=await convRes.json().catch(()=>({}));
  const conversations=Array.isArray(convData?.conversations)?convData.conversations:[];
  const sinceMs=since?Date.parse(since):null;
  for(const conv of conversations){
    const msgsRes=await fetchImpl(API+'/conversations/'+encodeURIComponent(conv.id)+'/messages?limit=50',{headers:v3});
    if(!msgsRes.ok)continue;
    const msgsData=await msgsRes.json().catch(()=>({}));
    const messages=Array.isArray(msgsData?.messages?.messages)?msgsData.messages.messages:[];
    for(const m of messages){
      const outbound=m?.direction==='outbound';
      const at=Date.parse(m?.dateAdded);
      if(outbound&&typeof m?.id==='string'&&String(m.body||'')===String(message)&&Number.isFinite(at)&&(sinceMs===null||at>=sinceMs)){
        return {found:true,messageId:m.id,conversationId:conv.id};
      }
    }
  }
  return {found:false};
}
