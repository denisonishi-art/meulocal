'use client';
import {useEffect,useState} from 'react';
import {ArrowLeft,RefreshCw,AlertTriangle} from 'lucide-react';
type Channels={queued:number;sent:number;sentWithProviderId:number;repliedEvents:number;failed:number};
type Metrics={diagnostics:number;diagnosticsContacted:number;diagnosticOpened:number;diagnosticClicked:number;converted:number;withCompetitorComparison:number;leads:number;leadsWithGhlContact:number;repliesInLeads:number;qualified:number;activeAutomations:number;overdueAutomations:number;email:Channels;whatsapp:Channels};
type Report={asOf:string;metrics:Metrics;limitations:string[];sampleTruncated:boolean};
function Num({label,note,value}:{label:string;note:string;value:number|string}){return <article style={{padding:18,border:'1px solid #303643',borderRadius:14,background:'#141923',minWidth:170,flex:'1 1 170px'}}><div style={{opacity:.72,fontSize:13}}>{label}</div><strong style={{display:'block',fontSize:30,margin:'6px 0'}}>{value}</strong><small style={{opacity:.7}}>{note}</small></article>}
export default function FunilClient(){
 const [report,setReport]=useState<Report|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 async function load(){setLoading(true);setError('');try{const r=await fetch('/api/admin/funil',{cache:'no-store'});const j=await r.json();if(!r.ok)throw new Error(j.error||'Erro ao carregar');setReport(j)}catch(e:any){setError(e.message)}finally{setLoading(false)}}
 useEffect(()=>{void load()},[]);
 const m=report?.metrics;
 return <main style={{maxWidth:1150,margin:'0 auto',padding:'24px 18px 56px',fontFamily:'inherit'}}>
  <header style={{display:'flex',flexWrap:'wrap',justifyContent:'space-between',gap:12,alignItems:'center'}}>
   <div><a href="/admin" style={{display:'inline-flex',alignItems:'center',gap:6,marginBottom:12}}><ArrowLeft size={16}/> Voltar ao MeuLocal Admin</a><h1 style={{fontSize:32,margin:0}}>Funil comercial</h1><p>Da descoberta ao cliente, com distinção entre registro interno e entrega comprovada.</p></div>
   <button onClick={()=>void load()} disabled={loading} style={{padding:12,borderRadius:10,border:'1px solid #687084',display:'flex',gap:8,alignItems:'center'}}><RefreshCw size={16}/> Atualizar</button>
  </header>
  {error&&<p role="alert">{error}</p>}
  {m&&<><p style={{opacity:.75}}>Atualizado em {new Date(report!.asOf).toLocaleString('pt-BR')} · Dados internos do MeuLocal</p>
   <section style={{display:'flex',flexWrap:'wrap',gap:12,margin:'22px 0'}}>
    <Num label="Diagnósticos" value={m.diagnostics} note="Cadastros encontrados"/>
    <Num label="Marcados como contatados" value={m.diagnosticsContacted} note="Não equivale a entregue"/>
    <Num label="Respostas registradas" value={m.repliesInLeads} note="Sincronização com GHL pendente"/>
    <Num label="Conversões" value={m.converted} note="Diagnóstico convertido"/>
   </section>
   <h2 style={{fontSize:21}}>Entrega por canal</h2>
   <div style={{display:'flex',flexWrap:'wrap',gap:12,marginBottom:22}}>
    {([['E-mail',m.email],['WhatsApp',m.whatsapp]] as [string,Channels][]).map(([name,c])=><section key={name} style={{border:'1px solid #303643',borderRadius:12,padding:18,flex:'1 1 260px'}}><h3>{name}</h3><p>Na fila: <strong>{c.queued}</strong> · Marcadas como enviadas: <strong>{c.sent}</strong></p><p>Enviadas com ID do provedor: <strong>{c.sentWithProviderId}</strong></p><p>Eventos de resposta: <strong>{c.repliedEvents}</strong> · Falhas: <strong>{c.failed}</strong></p><small>Entrega efetiva: não verificada nesta tela.</small></section>)}
   </div>
   <h2 style={{fontSize:21}}>Etapas seguintes</h2>
   <div style={{display:'flex',flexWrap:'wrap',gap:12,marginBottom:22}}>
    <Num label="Diagnóstico aberto" value={m.diagnosticOpened} note="Eventos registrados"/>
    <Num label="Clique no diagnóstico" value={m.diagnosticClicked} note="Eventos registrados"/>
    <Num label="Leads em conversa" value={m.qualified} note="Etapa do CRM interno"/>
    <Num label="Com comparação competitiva" value={m.withCompetitorComparison} note="Diagnósticos enriquecidos"/>
   </div>
   <section style={{border:'1px solid #715425',background:'#231d16',borderRadius:12,padding:18,marginBottom:22}}>
    <h2 style={{fontSize:20,display:'flex',gap:8,alignItems:'center'}}><AlertTriangle size={20}/> Atenção operacional</h2>
    <p><strong>{m.overdueAutomations}</strong> automações ativas estão atrasadas, de <strong>{m.activeAutomations}</strong> ativas.</p>
    <p>Não disparar a fila acumulada sem validar respostas, opt-outs e entregas no GHL.</p>
   </section>
   <h2 style={{fontSize:21}}>Limitações de mensuração</h2>
   <ul>{report!.limitations.map(t=><li key={t}>{t}</li>)}</ul>
   {report!.sampleTruncated&&<p role="alert">Amostra limitada a 1.000 registros por tabela; indicadores não representam necessariamente toda a base.</p>}
  </>}
 </main>;
}
