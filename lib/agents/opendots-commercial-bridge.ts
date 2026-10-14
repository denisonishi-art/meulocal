/** Outbound-only handoff to a separately hosted OpenDots commercial runtime.
 * It NEVER sends customer messages, changes CRM state, or bypasses DND.
 * Disabled until the private endpoint and shared secret are configured.
 */
import {createHmac} from 'node:crypto';
export async function forwardInboundToOpenDots(input:{eventId:string;leadId:string;contactId:string;locationId:string;conversationId:string|null;messageId:string|null;message:string;channel:string|null}){
 const endpoint=process.env.OPENDOTS_COMMERCIAL_URL;
 const secret=process.env.OPENDOTS_COMMERCIAL_SECRET;
 if(!endpoint||!secret)return {status:'not_configured'} as const;
 let url:URL;
 try{url=new URL(endpoint)}catch{return {status:'invalid_endpoint'} as const}
 // No arbitrary remote destinations, no loopback or redirects.
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!url.hostname.endsWith('.meulocal.ia.br'))return {status:'invalid_endpoint'} as const;
 const body=JSON.stringify({version:1,kind:'meulocal.acquisition.inbound',...input,permissions:{initialSend:false,autoReply:false,crmWrite:false},occurredAt:new Date().toISOString()});
 const signature=createHmac('sha256',secret).update(body).digest('hex');
 try{
  const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-MeuLocal-Signature':'sha256='+signature,'X-MeuLocal-Event-Id':input.eventId},body,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
  return {status:res.ok?'accepted':'rejected',httpStatus:res.status} as const;
 }catch{return {status:'unavailable'} as const}
}
