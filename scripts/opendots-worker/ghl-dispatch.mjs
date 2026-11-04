const API='https://services.leadconnectorhq.com';

/** Gated GHL send. Inert unless MEULOCAL_AUTO_REPLY_ENABLED==='true' AND GHL_API_KEY is set.
 * The full guard (providerGate, DND settings, consent, durable lease) lives in the MeuLocal app
 * (lib/acquisition/delivery.ts); this module is the worker-side first line of defense only. */
export function canDispatch(){
  return process.env.MEULOCAL_AUTO_REPLY_ENABLED==='true' && Boolean(process.env.GHL_API_KEY);
}

export async function readContactForSend({token,locationId,contactId,fetchImpl=fetch}){
  const res=await fetchImpl(API+'/contacts/'+encodeURIComponent(contactId),{headers:{Authorization:'Bearer '+token,Accept:'application/json',Version:'2021-07-28'}});
  if(!res.ok)throw Error('ghl_contact_read_'+res.status);
  const data=await res.json();
  const contact=data?.contact;
  if(!contact||contact.locationId!==locationId||contact.id!==contactId)throw Error('contact_identity_unverified');
  return contact;
}

export function contactBlocked(contact){
  if(contact.dnd===true||(Array.isArray(contact.tags)&&contact.tags.includes('meulocal:opt-out')))return {blocked:true,reason:'opt_out_or_dnd'};
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
