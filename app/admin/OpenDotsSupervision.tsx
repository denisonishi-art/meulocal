'use client';
import {useEffect,useState} from 'react';
import type {OpenDotsGuidance} from '@/lib/agents/opendots-guidance';
type Row={eventId:string;businessId:string;state:string;attempts:number;guidance:OpenDotsGuidance|null};
type Operation={kind:string;count:number;rows:Array<{id:string;state:string;partial:boolean;nextStep:string;businessId?:string;leadId?:string;checkoutId?:string}>};
type Data={operations?:Operation[];pending:{count:number;rows:Row[]};completed:{count:number;rows:Row[]}};
export default function OpenDotsSupervision(){
 const[data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 async function load(){setLoading(true);setError('');try{
  const response=await fetch('/api/admin/supervision',{cache:'no-store'}),value=await response.json();
  if(!response.ok)throw Error(value.error||'Não foi possível consultar a supervisão.');
  setData(value);
 }catch(e){setError(e instanceof Error?e.message:'Não foi possível consultar a supervisão.')}finally{setLoading(false)}}
 useEffect(()=>{void load()},[]);
 return <section className="adminPanel">
  <div className="panelHead"><div><span>OPENDOTS</span><h2>Revisão humana</h2></div><button className="textBtn" disabled={loading} onClick={load}>Atualizar orientações</button></div>
  <p>Orientações salvas para conferência. Esta consulta não envia mensagens, cobra, convida ou ativa contas.</p>
  {loading&&<p role="status">Consultando registros...</p>}
  {error&&<div role="alert" className="adminMessage error">{error} <button className="textBtn" disabled={loading} onClick={load}>Tentar novamente</button></div>}
  {!loading&&!error&&data&&<>
   <h3>Pendências de processamento: {data.pending.count}</h3>
   <p>Até 20 pendências mais antigas. Tentativas não comprovam conclusão.</p>
   {!data.pending.count&&<p>Nenhuma pendência registrada.</p>}
   {data.pending.rows.map(row=><article className="replyCard" key={row.eventId}><div><strong>{row.state==='processing'?'Em processamento':'Aguardando processamento'}</strong><small>Evento: {row.eventId} · Empresa: {row.businessId} · Tentativas: {row.attempts}</small><p>{row.guidance?'Decisão salva; há etapas de processamento pendentes.':'Orientação ainda não disponível neste recibo.'}</p><p>Próximo passo: conferir o recibo e a retomada deste mesmo evento. Não aprovar nem executar uma orientação sem decisão salva.</p>{row.guidance&&<><p>{row.guidance.message}</p><p>{row.guidance.rationale}</p></>}</div></article>)}
   {data.operations?.map(group=><section key={group.kind}><h3>{group.kind==='cadence'?'Cadência':group.kind==='payment'?'Pagamento e acesso':group.kind==='reviews'?'Avaliações':'Aquisição e respostas'}: {group.count} pendência(s)</h3><p>Até 20 pendências mais antigas. Resultado incerto não comprova envio, entrega ou conclusão.</p>{group.rows.map(row=><article className="replyCard" key={row.id}><div><strong>{row.state==='ambiguous'||row.state==='dispatching'?'Resultado incerto':row.partial?'Falha parcial — retomada pendente':'Processamento pendente'}</strong><small>Registro: {row.id}{row.businessId?' · Empresa: '+row.businessId:''}{row.leadId?' · Lead: '+row.leadId:''}{row.checkoutId?' · Checkout: '+row.checkoutId:''}</small><p>Próximo passo: {row.nextStep}</p></div></article>)}</section>)}
   <h3>Decisões salvas: {data.completed.count}</h3><p>Até 20 decisões mais recentes. O salvamento não significa aprovação humana ou execução.</p>
   {data.completed.rows.map(row=><article className="replyCard" key={row.eventId}><div><strong>Revisão humana necessária</strong><small>Evento: {row.eventId} · Empresa: {row.businessId}</small>{row.guidance?<><p>{row.guidance.message}</p><p>{row.guidance.rationale}</p>{row.guidance.nextPath&&<a href={row.guidance.nextPath}>{row.guidance.nextPath==='/onboarding'?'Consultar onboarding existente':'Consultar painel existente'}</a>}</>:<p>Orientação não disponível neste recibo. Consulte o registro original do OpenDots.</p>}</div></article>)}
  </>}
 </section>;
}
