const API='https://services.leadconnectorhq.com';

async function parse(res:Response){
  const body=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(body?.message||body?.error||('HighLevel HTTP '+res.status));
  return body;
}

export async function getLocationAccessToken(locationId:string){
  const directToken=process.env.GHL_API_KEY;
  if(directToken)return directToken;
  const agencyToken=process.env.GHL_AGENCY_ACCESS_TOKEN;
  const companyId=process.env.GHL_COMPANY_ID;
  if(!agencyToken||!companyId)throw new Error('Credenciais operacionais não configuradas.');
  const headers={Authorization:'Bearer '+agencyToken,'Content-Type':'application/json',Accept:'application/json',Version:'v3'};
  let res=await fetch(API+'/oauth/location-token',{method:'POST',headers,body:JSON.stringify({companyId,locationId}),cache:'no-store'});
  if(res.status===404||res.status===405){
    res=await fetch(API+'/oauth/locationToken',{method:'POST',headers:{...headers,Version:'2021-07-28'},body:JSON.stringify({companyId,locationId}),cache:'no-store'});
  }
  const data=await parse(res);
  if(!data?.access_token)throw new Error('Token da unidade não retornado.');
  return String(data.access_token);
}

export async function upsertOperationalContact(args:{token:string;locationId:string;name?:string|null;email?:string|null;phone?:string|null}){
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
    cache:'no-store'
  });
  const data=await parse(res);
  const id=data?.contact?.id;
  if(!id)throw new Error('Contato operacional não retornado.');
  return {id:String(id),raw:data};
}

export async function sendOperationalMessage(args:{
  token:string;contactId:string;channel:'whatsapp'|'email';message:string;subject?:string;email?:string|null
}){
  const type=args.channel==='whatsapp'?'WhatsApp':'Email';
  const payload:any={type,contactId:args.contactId,message:args.message};
  if(type==='Email'){
    payload.subject=args.subject||'Como foi sua experiência?';
    payload.html='<p>'+args.message.replace(/\n/g,'<br/>')+'</p>';
    if(args.email)payload.emailTo=args.email;
  }
  const res=await fetch(API+'/conversations/messages',{
    method:'POST',
    headers:{Authorization:'Bearer '+args.token,'Content-Type':'application/json',Accept:'application/json',Version:'2021-07-28'},
    body:JSON.stringify(payload),
    cache:'no-store'
  });
  const data=await parse(res);
  return {messageId:data?.messageId||null,conversationId:data?.conversationId||null,raw:data};
}
