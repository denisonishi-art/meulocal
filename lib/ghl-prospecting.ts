const API='https://services.leadconnectorhq.com';

const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function safeWebsite(value:string){try{const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.hostname==='localhost'||/^127\.|^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[0-1])\./.test(url.hostname))return null;return url}catch{return null}}
function emails(html:string){return [...new Set((html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[]).map(x=>x.toLowerCase().replace(/[),.;:]+$/,'')).filter(x=>!/(example|noreply|no-reply|wixpress|sentry)/.test(x)))];}
export async function findBusinessEmail(website?:string|null){
 const url=website?safeWebsite(website):null;if(!url)return null;
 try{const root=await fetch(url,{signal:AbortSignal.timeout(7000),headers:{'User-Agent':'MeuLocal/1.0 contact discovery'}});const html=await root.text();const first=emails(html)[0];if(first)return first;
 const contact=html.match(/href=["']([^"']*(?:contato|contact)[^"']*)["']/i)?.[1];
 if(contact){const page=new URL(contact,url);const response=await fetch(page,{signal:AbortSignal.timeout(7000),headers:{'User-Agent':'MeuLocal/1.0 contact discovery'}});return emails(await response.text())[0]||null}
 }catch{}return null;
}
export async function enqueueGhlProspect(input:{businessName:string;email:string;phone?:string|null;website?:string|null;diagnosticUrl:string}){
 // Tagging/upsert can trigger a published workflow. No server-owned eligibility,
 // approved-copy or delivery receipt is wired; environment flags are not proof.
 void input;return {ok:false,reason:'commercial_release_not_verified',contactId:null};
}

export async function sendGhlProspectWhatsApp(_input:{businessName:string;phone:string;diagnosticUrl:string}){
  // No contact upsert, WhatsApp send, or retry while initial-contact eligibility
  // and approved template dispatch are not implemented and verified.
  return {ok:false,reason:'whatsapp_outreach_blocked: approved template, opt-in and delivery validation required',contactId:null,conversationId:null,messageId:null};
}
