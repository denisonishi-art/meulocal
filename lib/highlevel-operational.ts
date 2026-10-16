const API='https://services.leadconnectorhq.com';

async function parse(res:Response){
  const body=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error('highlevel_http_'+res.status);
  return body;
}

export async function getLocationAccessToken(locationId:string,timeoutMs?:number){
  const directToken=process.env.GHL_API_KEY;
  if(directToken)return directToken;
  const agencyToken=process.env.GHL_AGENCY_ACCESS_TOKEN;
  const companyId=process.env.GHL_COMPANY_ID;
  if(!agencyToken||!companyId)throw new Error('Credenciais operacionais não configuradas.');
  const headers={Authorization:'Bearer '+agencyToken,'Content-Type':'application/json',Accept:'application/json',Version:'v3'};
  let res=await fetch(API+'/oauth/location-token',{method:'POST',headers,body:JSON.stringify({companyId,locationId}),cache:'no-store',signal:timeoutMs?AbortSignal.timeout(timeoutMs):undefined});
  if(res.status===404||res.status===405){
    res=await fetch(API+'/oauth/locationToken',{method:'POST',headers:{...headers,Version:'2021-07-28'},body:JSON.stringify({companyId,locationId}),cache:'no-store',signal:timeoutMs?AbortSignal.timeout(timeoutMs):undefined});
  }
  const data=await parse(res);
  if(!data?.access_token)throw new Error('Token da unidade não retornado.');
  return String(data.access_token);
}

export async function upsertOperationalContact(args:{token:string;locationId:string;name?:string|null;email?:string|null;phone?:string|null;timeoutMs?:number}){
  const res=await fetch(API+'/contacts/upsert',{
    method:'POST',
    headers:{Authorization:'Bearer '+args.token,'Content-Type':'application/json',Accept:'application/json',Version:'2021-07-28'},
    body:JSON.stringify({
      locationId:args.locationId,
      name:args.name||undefined,
      email:args.email||undefined,
      phone:args.phone?('+'+args.phone.replace(/\D/g,'')):undefined,
      source:'MeuLocal'
    }),
    cache:'no-store',signal:args.timeoutMs?AbortSignal.timeout(args.timeoutMs):undefined
  });
  const data=await parse(res);
  const id=data?.contact?.id;
  if(!id)throw new Error('Contato operacional não retornado.');
  return {id:String(id),raw:data};
}

export async function sendOperationalMessage(args:{
  token:string;contactId:string;channel:'whatsapp'|'email';message:string;subject?:string;email?:string|null;timeoutMs?:number
}){
  const type=args.channel==='whatsapp'?'WhatsApp':'Email';
  const payload:any={type,contactId:args.contactId,message:args.message};
  if(type==='Email'){
    payload.subject=args.subject||'Como foi sua experiência?';
    payload.html='<p>'+args.message.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;').replace(/\n/g,'<br/>')+'</p>';
    if(args.email)payload.emailTo=args.email;
  }
  const res=await fetch(API+'/conversations/messages',{
    method:'POST',
    headers:{Authorization:'Bearer '+args.token,'Content-Type':'application/json',Accept:'application/json',Version:'2021-04-15'},
    body:JSON.stringify(payload),
    cache:'no-store',signal:args.timeoutMs?AbortSignal.timeout(args.timeoutMs):undefined
  });
  const data=await parse(res);
  return {messageId:data?.messageId||null,conversationId:data?.conversationId||null,raw:data};
}


export async function getOperationalConversationMessages(args:{token:string;conversationId:string;limit?:number}){
  const res=await fetch(API+'/conversations/'+encodeURIComponent(args.conversationId)+'/messages?limit='+(args.limit||50),{
    method:'GET',
    headers:{Authorization:'Bearer '+args.token,Accept:'application/json',Version:'v3'},
    cache:'no-store'
  });
  const data=await parse(res);
  return Array.isArray(data?.messages?.messages)?data.messages.messages:[];
}

export async function findOperationalConversation(args:{token:string;locationId:string;contactId:string}){
  const query=new URLSearchParams({locationId:args.locationId,contactId:args.contactId,limit:'20',sort:'desc'});
  const res=await fetch(API+'/conversations/search?'+query.toString(),{
    method:'GET',headers:{Authorization:'Bearer '+args.token,Accept:'application/json',Version:'v3'},cache:'no-store'
  });
  const data=await parse(res);
  const conversations=Array.isArray(data?.conversations)?data.conversations:[];
  return conversations[0]?.id?String(conversations[0].id):null;
}

export async function removeOperationalTags(args:{token:string;contactId:string;tags:string[]}){
  const res=await fetch(API+'/contacts/'+encodeURIComponent(args.contactId)+'/tags',{
    method:'DELETE',headers:{Authorization:'Bearer '+args.token,'Content-Type':'application/json',Accept:'application/json',Version:'2021-07-28'},
    body:JSON.stringify({tags:args.tags}),cache:'no-store'
  });
  await parse(res);
}

/** Read an exact ID through the existing authorized conversation history API.
 * Pagination is bounded; exhaustion is a refusal, never substitution by text. */
export async function getOperationalMessage(args:{token:string;messageId:string;conversationId:string}){
 let cursor:string|undefined;
 for(let page=0;page<5;page++){
  const query=new URLSearchParams({limit:'50',...(cursor?{lastMessageId:cursor}:{})});
  const res=await fetch(API+'/conversations/'+encodeURIComponent(args.conversationId)+'/messages?'+query,{
   headers:{Authorization:'Bearer '+args.token,Accept:'application/json',Version:'v3'},
   cache:'no-store',signal:AbortSignal.timeout(10000)
  });
  const data=await parse(res),batch=data?.messages;
  const found=batch?.messages?.find((message:any)=>message.id===args.messageId);
  if(found)return found;
  if(!batch?.nextPage||!batch.lastMessageId||batch.lastMessageId===cursor)break;
  cursor=batch.lastMessageId;
 }
 return null;
}

export async function getOperationalContact(args:{token:string;contactId:string;timeoutMs?:number}){
 const res=await fetch(API+'/contacts/'+encodeURIComponent(args.contactId),{headers:{Authorization:'Bearer '+args.token,Accept:'application/json',Version:'2021-07-28'},cache:'no-store',signal:AbortSignal.timeout(args.timeoutMs||10000)});
 const data=await parse(res);return data.contact;
}

/** Page metadata is required to reconcile every unseen provider ID to a durable cursor. */
export async function getOperationalConversationHistoryPage(args:{token:string;conversationId:string;lastMessageId?:string;timeoutMs?:number;requirePageMetadata?:boolean}){
 const query=new URLSearchParams({limit:'50',...(args.lastMessageId?{lastMessageId:args.lastMessageId}:{})});
 const res=await fetch(API+'/conversations/'+encodeURIComponent(args.conversationId)+'/messages?'+query,{
  headers:{Authorization:'Bearer '+args.token,Accept:'application/json',Version:'v3'},
  cache:'no-store',signal:AbortSignal.timeout(args.timeoutMs||10000)
 });
 const data=await parse(res),batch=data?.messages;
 if(!Array.isArray(batch?.messages))throw new Error('HighLevel history page invalid');
 if(args.requirePageMetadata&&typeof batch.nextPage!=='boolean')throw new Error('HighLevel history pagination unverified');
 return {messages:batch.messages,hasNext:Boolean(batch.nextPage),lastMessageId:typeof batch.lastMessageId==='string'?batch.lastMessageId:null};
}

/** Complete bounded search metadata; callers must refuse a truncated contact history. */
export async function getOperationalConversations(args:{token:string;locationId:string;contactId:string;timeoutMs:number}){
 const query=new URLSearchParams({locationId:args.locationId,contactId:args.contactId,limit:'20',sort:'desc'});
 const res=await fetch(API+'/conversations/search?'+query,{headers:{Authorization:'Bearer '+args.token,Accept:'application/json',Version:'v3'},cache:'no-store',signal:AbortSignal.timeout(args.timeoutMs)});
 const data=await parse(res);
 if(!Array.isArray(data?.conversations)||!Number.isSafeInteger(data.total)||data.total!==data.conversations.length)throw Error('conversation_scope_incomplete');
 return data.conversations as any[];
}
