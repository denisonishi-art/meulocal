/** Outbound-only handoff to a separately hosted OpenDots commercial runtime.
 * It NEVER sends customer messages, changes CRM state, or bypasses DND.
 * Disabled until the private endpoint and shared secret are configured.
 */
import {createHmac} from 'node:crypto';
import {readOpenDotsGuidance} from './opendots-guidance';
export type OpenDotsEvent={eventId:string;kind:string;version:number;occurredAt:string;permissions:{initialSend:false;autoReply:boolean;crmWrite:false};[key:string]:unknown};

/** autoReply is granted ONLY for contacts explicitly allowlisted in
 * MEULOCAL_E2E_ALLOWED_CONTACTS (comma-separated GHL contact IDs). Empty allowlist =
 * never auto-reply. This binds the send permission to the authorized test contact,
 * never a blanket grant. DND/opt-out/dedup are still enforced worker-side. */
function autoReplyAuthorizedFor(input:OpenDotsEvent):boolean{
 const allowlist=(process.env.MEULOCAL_E2E_ALLOWED_CONTACTS||'').split(',').map(s=>s.trim()).filter(Boolean);
 if(allowlist.length===0)return false;
 return typeof input.contactId==='string'&&allowlist.includes(input.contactId);
}
export async function deliverOpenDotsEvent(input:OpenDotsEvent){
 const endpoint=process.env.OPENDOTS_COMMERCIAL_URL;
 const secret=process.env.OPENDOTS_COMMERCIAL_SECRET;
 if(!endpoint||!secret)return {status:'not_configured'} as const;
 let url:URL;
 try{url=new URL(endpoint)}catch{return {status:'invalid_endpoint'} as const}
 // No arbitrary remote destinations, no loopback or redirects.
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!url.hostname.endsWith('.meulocal.ia.br'))return {status:'invalid_endpoint'} as const;
 const body=JSON.stringify({...input,permissions:{initialSend:false,autoReply:autoReplyAuthorizedFor(input),crmWrite:false}});
 const signature=createHmac('sha256',secret).update(body).digest('hex');
 try{
  const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-MeuLocal-Signature':'sha256='+signature,'X-MeuLocal-Event-Id':input.eventId},body,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(45000)}); // 45s: > DeepSeek latency (~15s) e < maxDuration=60 do webhook; erro/timeout vira 'unavailable' e o retry/dedup recupera
  if(!res.ok)return {status:'rejected',httpStatus:res.status} as const;
  const receipt=await res.json().catch(()=>null);
  // dispatched is 0 (suggestion only) or 1 (worker sent via GHL). Both are valid,
  // idempotent receipts; the worker's durable receipt store guarantees one decision (and
  // at most one send) per eventId, so a replayed/duplicate call never produces two messages.
  if(receipt?.status!=='decision_saved'||receipt.eventId!==input.eventId||(receipt.dispatched!==0&&receipt.dispatched!==1)||
   !['answer','follow_up','handoff','stop'].includes(receipt.action))return {status:'receipt_unverified',httpStatus:res.status};
  const guidance=readOpenDotsGuidance(receipt.guidance);
  if(receipt.guidance!==undefined&&(!guidance||(guidance.nextPath&&(input.kind!=='meulocal.customer.lifecycle'||guidance.nextPath!==input.nextPath))))return {status:'receipt_unverified',httpStatus:res.status};
  return {status:'decision_saved',eventId:input.eventId,action:String(receipt.action),dispatched:receipt.dispatched===1?1:0,httpStatus:res.status,...(guidance?{guidance}:{})} as const;
 }catch{return {status:'unavailable'} as const}
}

export async function forwardInboundToOpenDots(input:{eventId:string;leadId:string;contactId:string;locationId:string;conversationId:string|null;messageId:string|null;message:string;channel:string|null;occurredAt?:string}){
 return deliverOpenDotsEvent({version:1,kind:'meulocal.acquisition.inbound',...input,occurredAt:input.occurredAt||new Date().toISOString(),permissions:{initialSend:false,autoReply:false,crmWrite:false}});
}
