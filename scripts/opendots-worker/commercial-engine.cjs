'use strict';
/** Commercial decision layer for the existing OpenDots worker.
 * Produces suggestions only. HighLevel remains the sole dispatcher.
 * modelTurn may be backed by the official OpenDots Platform.turn runtime.
 */
const ACTIONS=new Set(['answer','follow_up','handoff','stop']);
function validateEvent(event){
 if(!event||!['meulocal.acquisition.inbound','meulocal.acquisition.draft'].includes(event.kind))throw Error('invalid_event_kind');
 if(typeof event.eventId!=='string'||event.eventId.length<8||event.eventId.length>180)throw Error('invalid_event_id');
 if(event.kind==='meulocal.acquisition.inbound'&&(!event.leadId||!event.contactId||typeof event.message!=='string'||event.message.length>4000))throw Error('invalid_inbound');
 if(event.kind==='meulocal.acquisition.draft'&&(!event.prospect||typeof event.prospect.name!=='string'))throw Error('invalid_prospect');
 if(event.permissions?.initialSend||event.permissions?.crmWrite||event.permissions?.autoReply)throw Error('external_side_effects_forbidden');
 return event;
}
function promptFor(event){
 const base='Você é a inteligência comercial da MeuLocal. Não envie mensagens, não use ferramentas com efeitos externos, não altere CRM. Nunca invente diagnósticos, consentimento, resultados ou ofertas. Serviço: gestão contínua de avaliações Google por R$397/mês; não apresente preço no primeiro contato. Não solicite reunião logo de início. Respeite opt-out e escale reclamações, pedidos sensíveis, descontos e dúvidas sem evidência. Responda SOMENTE JSON com action (answer|follow_up|handoff|stop), channel (email|whatsapp|none), message, rationale, requiresHumanReview=true.';
 if(event.kind==='meulocal.acquisition.draft')return base+' Gere abordagem individual para E-MAIL após seleção humana. Use apenas dados observados. Nunca assuma que o prospect já solicitou contato. Formule uma pergunta consultiva simples e inclua opção de não receber mais mensagens. Dados: '+JSON.stringify(event.prospect).slice(0,2500);
 return base+' Interprete esta resposta real de um prospect, levando em conta o histórico fornecido. Se houver SAIR, STOP, não me contate ou recusa, action=stop, message vazio. Se for ambígua ou exigir decisão humana, action=handoff. Para WhatsApp, somente sugira uma resposta; o envio depende de janela permitida/template aprovado pelo HighLevel. Dados: '+JSON.stringify({message:event.message,channel:event.channel,history:event.history||[]}).slice(0,4500);
}
function parseDecision(raw,event){
 let value;try{value=JSON.parse(String(raw).replace(/^\x60\x60\x60(?:json)?\s*|\s*\x60\x60\x60$/g,''))}catch{throw Error('model_json_invalid')}
 if(!value||!ACTIONS.has(value.action)||!['email','whatsapp','none'].includes(value.channel)||typeof value.message!=='string'||value.message.length>1800||typeof value.rationale!=='string'||value.rationale.length>1000||value.requiresHumanReview!==true)throw Error('model_contract_invalid');
 const stop=/^(sair|stop|cancelar|unsubscribe|não me (?:contate|mande mensagens)|nao me (?:contate|mande mensagens))/i.test(String(event.message||'').trim());
 if(stop||value.action==='stop')return {eventId:event.eventId,action:'stop',channel:'none',message:'',rationale:'Solicitação de interrupção; nenhuma resposta comercial.',requiresHumanReview:true,status:'suggestion_only'};
 if(event.kind==='meulocal.acquisition.draft'&&value.channel!=='email')throw Error('first_contact_email_only');
 if(value.action==='answer'&&!value.message.trim())throw Error('empty_answer');
 return {eventId:event.eventId,action:value.action,channel:value.channel,message:value.message,rationale:value.rationale,requiresHumanReview:true,status:'suggestion_only'};
}
async function decideCommercialEvent(event,{modelTurn}){
 validateEvent(event);
 if(typeof modelTurn!=='function')throw Error('opendots_model_turn_required');
 const stop=/^(sair|stop|cancelar|unsubscribe|não me (?:contate|mande mensagens)|nao me (?:contate|mande mensagens))/i.test(String(event.message||'').trim());
 if(stop)return {eventId:event.eventId,action:'stop',channel:'none',message:'',rationale:'Opt-out explícito',requiresHumanReview:true,status:'suggestion_only'};
 const raw=await modelTurn(promptFor(event));
 return parseDecision(raw,event);
}
module.exports={validateEvent,promptFor,parseDecision,decideCommercialEvent};
