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
 const token=process.env.GHL_API_KEY;const locationId=process.env.GHL_LOCATION_ID||'uNh3KsM7WFuLeTN8Q583';
 if(!token)return {ok:false,reason:'GHL_API_KEY não configurada'};
 const headers={'Authorization':`Bearer ${token}`,'Version':'2021-07-28','Content-Type':'application/json'};
 let customField:any=null;
 try{const fields=await fetch(`${API}/locations/${locationId}/customFields?model=contact`,{headers});const payload=await fields.json();customField=(payload.customFields||payload.data||[]).find((field:any)=>normalize(field.name||field.fieldKey||'')==='link do diagnostico')}catch{}
 if(!customField)return {ok:false,reason:'Campo “Link do diagnóstico” não encontrado no GHL'};
 const payload={locationId,name:input.businessName,email:input.email,phone:input.phone||undefined,website:input.website||undefined,tags:['meulocal:prospectar','origem: prospecção'],customFields:[{id:customField.id,value:input.diagnosticUrl}]};
 const response=await fetch(`${API}/contacts/upsert`,{method:'POST',headers,body:JSON.stringify(payload)});if(!response.ok)return {ok:false,reason:`GHL recusou o contato (${response.status})`};
 const body=await response.json().catch(()=>({}));return {ok:true,contactId:body.contact?.id||body.id||null};
}
