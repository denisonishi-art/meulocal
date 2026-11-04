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
  if(typeof contact.dnd==='boolean')return contact;
  // Some contact-detail projections omit suppression fields. Verify via the exact contact
  // search instead; absence never implies DND=false.
  const field=contact.email?'email':contact.phone?'phone':null;
  if(!field)return contact; // no searchable field → dnd stays undefined (contactBlocked fails closed)
  const value=String(contact[field]).trim();
  const search=await fetchImpl(API+'/contacts/search',{method:'POST',headers:{Authorization:'Bearer '+token,Accept:'application/json','Content-Type':'application/json',Version:'2021-07-28'},body:JSON.stringify({locationId,filters:[{field,operator:'eq',value}],page:1,pageLimit:100})});
  if(!search.ok)throw Error('ghl_contact_search_'+search.status);
  const result=await search.json();
  const matches=result?.contacts;
  if(!Array.isArray(matches)||matches.length!==1||matches[0]?.id!==contactId||matches[0]?.locationId!==locationId)throw Error('contact_dnd_unverified');
  return {...contact,...(typeof matches[0].dnd==='boolean'?{dnd:matches[0].dnd}:{})};
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
  // An HTTP error response means the provider definitively rejected the send (no side
  // effect). A network/timeout throw (fetchImpl rejecting) propagates WITHOUT `definitive`
  // — that outcome is UNCERTAIN and must be reconciled, never marked failed.
  if(!res.ok)throw Object.assign(new Error('ghl_send_'+res.status),{definitive:true});
  return {messageId:data?.messageId||data?.id||null,conversationId:data?.conversationId||null};
}

/** Reconcile an uncertain send: after a crash between GHL acceptance and receipt persistence,
 * the ledger holds an 'intent'. Query the contact's conversation history for an OUTBOUND
 * message matching the exact content at-or-after the intent timestamp. Returns {found,...}
 * or {found:false}; "not found" is never treated as "sent". */
export async function reconcileSentMessage({token,locationId,contactId,message,since,fetchImpl=fetch,maxPages=10}){
  const v3={Authorization:'Bearer '+token,Accept:'application/json',Version:'v3'};
  const convRes=await fetchImpl(API+'/conversations/search?'+new URLSearchParams({locationId,contactId,limit:'20',sort:'desc'}).toString(),{headers:v3});
  if(!convRes.ok)throw Error('ghl_conv_search_'+convRes.status);
  const convData=await convRes.json().catch(()=>({}));
  const conversations=Array.isArray(convData?.conversations)?convData.conversations:[];
  const total=convData?.total;
  // The conversation list must be complete (total===length); a truncated list means we
  // cannot prove absence across all conversations.
  let complete=Number.isSafeInteger(total)&&total===conversations.length;
  const sinceMs=since?Date.parse(since):null;
  for(const conv of conversations){
    let cursor;let exhausted=false;let convComplete=true;
    for(let page=0;page<maxPages;page++){
      const q=new URLSearchParams({limit:'50',...(cursor?{lastMessageId:cursor}:{})});
      const msgsRes=await fetchImpl(API+'/conversations/'+encodeURIComponent(conv.id)+'/messages?'+q.toString(),{headers:v3});
      if(!msgsRes.ok){convComplete=false;break;}
      const batch=(await msgsRes.json().catch(()=>({})))?.messages;
      const messages=Array.isArray(batch?.messages)?batch.messages:[];
      for(const m of messages){
        const outbound=m?.direction==='outbound';
        const at=Date.parse(m?.dateAdded);
        if(outbound&&typeof m?.id==='string'&&String(m.body||'')===String(message)&&Number.isFinite(at)&&(sinceMs===null||at>=sinceMs)){
          return {found:true,messageId:m.id,conversationId:conv.id};
        }
      }
      // Pagination must be verifiable. nextPage false = exhausted (complete). Missing
      // nextPage or a stuck cursor = cannot prove we reached the end → incomplete.
      if(typeof batch?.nextPage!=='boolean'){convComplete=false;break;}
      if(batch.nextPage===false){exhausted=true;break;}
      if(!batch.lastMessageId||batch.lastMessageId===cursor){convComplete=false;break;}
      cursor=batch.lastMessageId;
    }
    if(!exhausted)convComplete=false;
    if(!convComplete)complete=false;
  }
  return {found:false,complete};
}
