export type InboundIntent='opt_out'|'interested'|'other';
/** Classifies an inbound message only; never authorizes outbound contact. */
export function classifyInboundIntent(body:string):InboundIntent {
  const value=body.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
  if (/^(sair|stop|cancelar|unsubscribe|nao tenho interesse|nao quero|nao me contate|remover contato|pare de enviar)([.! ]*)$/.test(value)) return 'opt_out';
  if (/^(quero ver a analise|quero receber a analise|pode enviar|tenho interesse|sim, pode enviar)([.! ]*)$/.test(value)) return 'interested';
  return 'other';
}
