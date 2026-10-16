import {createHmac,timingSafeEqual} from 'node:crypto';
import {Resolver} from 'node:dns/promises';
import {z} from 'zod';
import {getLocationAccessToken,getOperationalContact,getOperationalConversations,getOperationalConversationHistoryPage} from '@/lib/highlevel-operational';
import {providerGate} from './delivery';
export const MANUAL_LOCATION='uNh3KsM7WFuLeTN8Q583';
export type ProspectRecipient={id:string;name:string;address?:string;channel:'email'|'whatsapp';recipient:string};
export function signRecipient(value:ProspectRecipient,now=Date.now()){
 const secret=process.env.ADMIN_ACCESS_KEY;if(!secret)throw Error('Configuração administrativa indisponível.');
 const payload=Buffer.from(JSON.stringify({...value,expiresAt:now+15*60*1000})).toString('base64url');
 return payload+'.'+createHmac('sha256',secret).update('manual-prospect-v1:'+payload).digest('base64url');
}
export function verifyRecipient(token:string,now=Date.now()):ProspectRecipient{
 const secret=process.env.ADMIN_ACCESS_KEY;if(!secret)throw Error('Configuração administrativa indisponível.');
 const [payload,signature,...rest]=token.split('.');if(!payload||!signature||rest.length)throw Error('Verifique novamente os canais.');
 const expected=createHmac('sha256',secret).update('manual-prospect-v1:'+payload).digest();const actual=Buffer.from(signature,'base64url');
 if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw Error('Verifique novamente os canais.');
 const data=JSON.parse(Buffer.from(payload,'base64url').toString());
 if(!Number.isFinite(data.expiresAt)||data.expiresAt<=now||data.expiresAt>now+15*60*1000||!['email','whatsapp'].includes(data.channel)||typeof data.recipient!=='string'||typeof data.id!=='string'||typeof data.name!=='string')throw Error('Verifique novamente os canais.');
 return {id:data.id,name:data.name,address:data.address,channel:data.channel,recipient:data.recipient};
}
export async function findExactRecipient(token:string,target:ProspectRecipient){
 const value=target.recipient;
 const response=await fetch('https://services.leadconnectorhq.com/contacts/search',{method:'POST',headers:{Authorization:'Bearer '+token,Version:'2021-07-28','Content-Type':'application/json'},body:JSON.stringify({locationId:MANUAL_LOCATION,filters:[{field:target.channel==='email'?'email':'phone',operator:'eq',value}],page:1,pageLimit:100}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(7000)});
 if(!response.ok)throw Error('Não foi possível conferir o destinatário no HighLevel.');
 const body=await response.json(),contacts=body.contacts;
 const same=(c:any)=>target.channel==='email'?String(c.email||'').trim().toLowerCase()===value:String(c.phone||'').replace(/\D/g,'')===value.replace(/\D/g,'');
 if(!Array.isArray(contacts)||contacts.length>=100||contacts.some(c=>c.locationId!==MANUAL_LOCATION||!same(c))||contacts.length>1)throw Error('Há vínculos ambíguos para este destinatário.');
 if(!contacts.length)return null;
 const contact=await getOperationalContact({token,contactId:contacts[0].id,timeoutMs:7000});
 if(!contact||contact.id!==contacts[0].id||contact.locationId!==MANUAL_LOCATION||!same(contact))throw Error('O destinatário não pôde ser confirmado.');
 return contact;
}
export async function manualRecipientReadiness(db:any,target:ProspectRecipient){
 const deadline=Date.now()+20000;const budget=()=>{const left=deadline-Date.now();if(left<1000)throw Error('verification_timeout');return Math.min(left,6000)};
 const blocked=(reason:string)=>({canSend:false,reason,sendToken:null as string|null,recipient:target.recipient,channel:target.channel});
 try{
  if(process.env.GHL_LOCATION_ID!==MANUAL_LOCATION)return blocked('Unidade HighLevel não configurada.');
  if(target.channel==='email'){
   if(!z.string().email().safeParse(target.recipient).success)return blocked('E-mail com formato inválido.');
   const mx=await new Resolver({timeout:2000,tries:1}).resolveMx(target.recipient.split('@')[1]);if(!mx.some(x=>x.exchange&&x.exchange!=='.'))return blocked('Domínio sem recebimento de e-mail confirmado.');
  }
  const local=await db.rpc('check_manual_prospect_recipient',{p_place_id:target.id.replace(/^places\//,''),p_channel:target.channel,p_recipient:target.recipient});
  if(local.error||local.data?.allowed!==true)return blocked(local.data?.reason||'Não foi possível conferir as restrições locais.');
  const token=await getLocationAccessToken(MANUAL_LOCATION,7000),contact=await findExactRecipient(token,target);
  if(contact){
   if(contact.tags?.includes('meulocal:opt-out'))return blocked('Destinatário solicitou não receber contatos.');
   if(contact.tags?.some((tag:string)=>['meulocal:prospectar','follow-up'].includes(tag)))return blocked('Contato já vinculado a uma régua no HighLevel; confira antes de enviar.');
   const stop=await providerGate({locationId:MANUAL_LOCATION,contactId:contact.id,channel:target.channel,recipient:target.channel==='email'?target.recipient:target.recipient.replace(/\D/g,'')},token,true,budget);
   if(stop)return blocked('Destinatário com restrição de contato no HighLevel.');
  }
  if(target.channel==='whatsapp'){
   if(!contact)return blocked('Telefone encontrado; WhatsApp ainda não confirmado.');
   const conversations=await getOperationalConversations({token,locationId:MANUAL_LOCATION,contactId:contact.id,timeoutMs:7000});let valid=false;
   for(const c of conversations){const batch=await getOperationalConversationHistoryPage({token,conversationId:c.id,timeoutMs:7000,requirePageMetadata:true});if(batch.messages.some((m:any)=>m.contactId===contact.id&&m.direction==='inbound'&&['whatsapp','type_whatsapp'].includes(String(m.messageType||m.type||'').toLowerCase())&&Date.parse(m.dateAdded)>Date.now()-23*60*60*1000&&Date.parse(m.dateAdded)<=Date.now()))valid=true;}
   if(!valid)return blocked('WhatsApp exige conversa recente confirmada ou modelo aprovado.');
  }
  if(process.env.MEULOCAL_MANUAL_OUTREACH_ENABLED!=='true')return blocked('Canal identificado; envio manual ainda desativado.');
  return {canSend:true,reason:target.channel==='email'?'E-mail e domínio verificados. Envio somente com sua confirmação.':'WhatsApp confirmado com conversa recente. Envio somente com sua confirmação.',sendToken:signRecipient(target),recipient:target.recipient,channel:target.channel};
 }catch(error){
  const code=error instanceof Error?error.message:'';
  const reasons:Record<string,string>={
   conversation_scope_incomplete:'Histórico HighLevel incompleto. Envio indisponível até concluir a verificação.',
   acquisition_identity_unverified:'Identidade ou configuração de bloqueio do contato não confirmada no HighLevel.',
   acquisition_dnd_unverified:'Configuração de bloqueio do canal não confirmada no HighLevel.',
   acquisition_history_unverified:'Histórico do contato não confirmado no HighLevel.',
   'HighLevel history page invalid':'Resposta de histórico HighLevel inválida.',
   'HighLevel history pagination unverified':'Paginação do histórico HighLevel não confirmada.',
   highlevel_http_401:'Credencial HighLevel recusada. Envio indisponível.',
   highlevel_http_403:'Permissão de leitura HighLevel insuficiente. Envio indisponível.',
   highlevel_http_400:'Consulta de histórico recusada pelo HighLevel. Envio indisponível.',
   highlevel_http_422:'Contrato de consulta recusado pelo HighLevel. Envio indisponível.',
   verification_timeout:'HighLevel não respondeu a tempo. Verifique novamente o canal.'
  };
  return blocked(reasons[code]||'Serviço de verificação indisponível. Verifique novamente o canal.');
 }

}
