/** Status de contato observável por diagnóstico. Não infere entrega de uma
 * fila, de um status de CRM ou de um evento "sent" no HighLevel. */
export type DiagnosticContactState='saved'|'queued'|'sent'|'delivered'|'replied'|'failed';
export type DiagnosticContactEvent={
 event_type:string;
 channel:string|null;
 provider?:string|null;
 created_at:string;
};
export type DiagnosticContactStatus={
 state:DiagnosticContactState;
 label:string;
 evidenceAt:string|null;
 channel:string|null;
};
const priority:Record<DiagnosticContactState,number>={
 saved:0,queued:1,failed:2,sent:3,delivered:4,replied:5
};
const labels:Record<DiagnosticContactState,string>={
 saved:'Salvo — sem envio registrado',
 queued:'Na fila — envio não confirmado',
 failed:'Falha registrada — conferir',
 sent:'Envio registrado — entrega não confirmada',
 delivered:'Entrega registrada',
 replied:'Resposta registrada'
};
export function diagnosticContactStatus(events:DiagnosticContactEvent[]):DiagnosticContactStatus{
 let best:DiagnosticContactState='saved';
 let chosen:DiagnosticContactEvent|null=null;
 const ordered=[...events].sort((a,b)=>Date.parse(b.created_at||'')-Date.parse(a.created_at||''));
 for(const event of ordered){
  const type=event.event_type as DiagnosticContactState;
  if(!(type in priority)||type==='saved')continue;
  if(priority[type]>priority[best]){
   best=type;
   chosen=event;
  }
 }
 return {
  state:best,
  label:labels[best],
  evidenceAt:chosen?.created_at||null,
  channel:chosen?.channel||null
 };
}
