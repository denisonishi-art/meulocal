export type InboundIntent='opt_out'|'interested'|'other';
export type InboundState='explicit_refusal'|'common_reply'|'inconclusive';
/** Missing content and ambiguous refusal language require review, never permanent opt-out. */
export function classifyInboundState(body:unknown):InboundState {
  if(typeof body!=='string'||!body.trim())return 'inconclusive';
  if(classifyInboundIntent(body)==='opt_out')return 'explicit_refusal';
  const text=body.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(/\b(sair|stop|unsubscribe|cancelar|cancelamento|nao quero|nao tenho interesse|nao me contate|remover contato|pare de enviar)\b/.test(text))return 'inconclusive';
  return 'common_reply';
}
/** Classifies an inbound message only; never authorizes outbound contact. */
export function classifyInboundIntent(body:string):InboundIntent {
  const value=body.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
  if (/^(sair|stop|cancelar|unsubscribe|nao tenho interesse|nao quero|nao me contate|remover contato|pare de enviar)([.! ]*)$/.test(value)) return 'opt_out';
  if (/^(quero ver a analise|quero receber a analise|pode enviar|tenho interesse|sim, pode enviar)([.! ]*)$/.test(value)) return 'interested';
  return 'other';
}
