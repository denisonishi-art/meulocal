/** Outbound-only handoff to a separately hosted OpenDots commercial runtime.
 * It NEVER sends customer messages, changes CRM state, or bypasses DND.
 * Disabled until the private endpoint and shared secret are configured.
 */
import {createHmac} from 'node:crypto';
import {readOpenDotsGuidance} from './opendots-guidance';
export type OpenDotsEvent={eventId:string;kind:string;version:number;occurredAt:string;permissions:{initialSend:false;autoReply:false;crmWrite:false};[key:string]:unknown};
export async function deliverOpenDotsEvent(input:OpenDotsEvent){
 const endpoint=process.env.OPENDOTS_COMMERCIAL_URL;
 const secret=process.env.OPENDOTS_COMMERCIAL_SECRET;
 if(!endpoint||!secret)return {status:'not_configured'} as const;
 let url:URL;
 try{url=new URL(endpoint)}catch{return {status:'invalid_endpoint'} as const}
 // No arbitrary remote destinations, no loopback or redirects.
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!url.hostname.endsWith('.meulocal.ia.br'))return {status:'invalid_endpoint'} as const;
 const body=JSON.stringify({...input,permissions:{initialSend:false,autoReply:false,crmWrite:false}});
 const signature=createHmac('sha256',secret).update(body).digest('hex');
 try{
  const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-MeuLocal-Signature':'sha256='+signature,'X-MeuLocal-Event-Id':input.eventId},body,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!res.ok)return {status:'rejected',httpStatus:res.status} as const;
  const receipt=await res.json().catch(()=>null);
  if(receipt?.status!=='decision_saved'||receipt.eventId!==input.eventId||receipt.dispatched!==0||
   !['answer','follow_up','handoff','stop'].includes(receipt.action))return {status:'receipt_unverified',httpStatus:res.status} as const;
  const guidance=readOpenDotsGuidance(receipt.guidance);
  if(receipt.guidance!==undefined&&(!guidance||(guidance.nextPath&&(input.kind!=='meulocal.customer.lifecycle'||guidance.nextPath!==input.nextPath))))return {status:'receipt_unverified',httpStatus:res.status} as const;
  return {status:'decision_saved',eventId:input.eventId,action:String(receipt.action),dispatched:0,httpStatus:res.status,...(guidance?{guidance}:{})} as const;
 }catch{return {status:'unavailable'} as const}
}

export async function forwardInboundToOpenDots(input:{eventId:string;leadId:string;contactId:string;locationId:string;conversationId:string|null;messageId:string|null;message:string;channel:string|null;occurredAt?:string}){
 return deliverOpenDotsEvent({version:1,kind:'meulocal.acquisition.inbound',...input,occurredAt:input.occurredAt||new Date().toISOString(),permissions:{initialSend:false,autoReply:false,crmWrite:false}});
}
