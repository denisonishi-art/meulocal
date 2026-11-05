'use client';
import {FormEvent,useEffect,useMemo,useState} from 'react';
import {
  Activity,ArrowUpRight,Bot,Building2,Check,ClipboardCheck,
  Gauge,LogOut,MapPin,RefreshCw,Search,Send,ShieldCheck,Sparkles,Users,Workflow
} from 'lucide-react';

import {getManualAttempt,clearManualAttempt,requireAcquisitionReceipt,acquisitionFailure} from '@/lib/acquisition/manual-intent';
import {initialAcquisitionMessage} from '@/lib/acquisition/message';
import OpenDotsSupervision from './OpenDotsSupervision';

type Candidate={id:string;name:string;address:string;rating:number|null;reviews:number|null;website:string|null;phone:string|null;score:number|null;priority:string;competitorAverageReviews?:number|null;competitionMode?:'local_radius'|'city_region'|'search_market';competitionLabel?:string|null;searchIntent?:string|null};
type View='overview'|'prospecting'|'leads'|'diagnostics'|'customers'|'automations'|'agents'|'supervision';
type DiagnosticCatalogRow={id:string;business_name:string;url:string;niche?:string|null;region?:string|null;created_at?:string;status?:string;reportReady:boolean;reportCount:number;contact:{state:string;label:string;evidenceAt:string|null;channel:string|null}};
type Overview={
  kpis:{leads:number;conversations:number;customers:number;onboardingPending:number;automationsActive:number;diagnosticsOpen:number;diagnosticConversions:number;paidCheckouts:number};
  leads:any[];diagnostics:any[];customers:any[];automations:any[];activity:any[];agents:any[];
  infrastructure:{ghlJobs:any[];syncLogs:any[]};
};

const labels:Record<View,string>={
  overview:'Visão geral',prospecting:'Prospecção',leads:'Leads',diagnostics:'Diagnósticos',
  customers:'Clientes',automations:'Automações',agents:'Agentes',supervision:'Supervisão'
};

function fmtDate(v?:string|null){if(!v)return '—';return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(v))}
function statusLabel(v?:string|null){
  const map:Record<string,string>={lead:'Lead',mql:'Qualificado',conversation:'Em conversa',customer:'Cliente',nurture:'Nutrição',lost:'Perdido',active:'Ativo',pending:'Pendente',in_progress:'Em andamento',completed:'Concluído',paid:'Pago',past_due:'Em atraso',canceled:'Cancelado',approved:'Aprovado',contacted:'Contatado',converted:'Convertido',online:'Online',attention:'Atenção',idle:'Aguardando',failed:'Falhou',success:'Sucesso',linked:'Conectado',error:'Erro',provisioning:'Provisionando'};
  return map[v||'']||String(v||'—').replaceAll('_',' ');
}
function Pill({value}:{value?:string|null}){const key=(value||'').replaceAll('_','-');return <span className={'statusPill '+key}>{statusLabel(value)}</span>}
export default function AdminClient(){
 const[catalog,setCatalog]=useState<DiagnosticCatalogRow[]>([]);
 const[catalogLoading,setCatalogLoading]=useState(true);
 const[catalogError,setCatalogError]=useState('');
 const[diagnosticQuery,setDiagnosticQuery]=useState('');
 const[diagnosticStateFilter,setDiagnosticStateFilter]=useState('all');
 const[generatedReports,setGeneratedReports]=useState<Record<string,{url:string;count:number}>>({});
 const[prepared,setPrepared]=useState<Array<{id:string;name:string;message:string}>>([]);
 const[manualRetryable,setManualRetryable]=useState<Record<string,boolean>>({});
 const[manualAudit,setManualAudit]=useState<Record<string,{message:string;provider:string;sendEvidence:string}>>({});
 const[manualResults,setManualResults]=useState<Record<string,string>>({});
 const[dispatchPreview,setDispatchPreview]=useState<Array<{name:string;status:string;reasons:string[]}>>([]);
 const[contactCheck,setContactCheck]=useState<Array<{id:string;canSend?:boolean;sendToken?:string|null;recipient?:string;name:string;channel:string;email?:string|null;phoneFound?:boolean;phone?:string|null;reason:string;ghlStatus?:string;eligibilityStatus?:string;eligibilityReasons?:string[];identifierStatus?:string;existingContact?:boolean;dnd?:boolean}>>([]);
 const[view,setView]=useState<View>('overview');
 const[data,setData]=useState<Overview|null>(null);const[loadingData,setLoadingData]=useState(true);const[dataError,setDataError]=useState('');
 const[niche,setNiche]=useState('');const[region,setRegion]=useState('');const[rows,setRows]=useState<Candidate[]>([]);const[selected,setSelected]=useState<string[]>([]);const[busy,setBusy]=useState(false);const[msg,setMsg]=useState('');const[diagMsg,setDiagMsg]=useState('');const[deliveryPeriod,setDeliveryPeriod]=useState<'all'|'week'|'month'>('all');const[replyingTo,setReplyingTo]=useState<string|null>(null);const[replyText,setReplyText]=useState('');

 async function loadCatalog(){
  setCatalogLoading(true);setCatalogError('');
  try{
   const response=await fetch('/api/admin/prospects/diagnostics',{cache:'no-store'});
   const body=await response.json();
   if(!response.ok||!Array.isArray(body.diagnostics))throw Error(body.error||'Histórico indisponível.');
   setCatalog(body.diagnostics);
  }catch(e:any){setCatalogError(String(e.message||e))}
  finally{setCatalogLoading(false)}
 }
 async function loadOverview(){setLoadingData(true);setDataError('');try{const r=await fetch('/api/admin/overview',{cache:'no-store'});const j=await r.json();if(!r.ok)throw new Error(j.error||'Falha ao carregar operação');setData(j)}catch(e:any){setDataError(e.message)}finally{setLoadingData(false)}}
 useEffect(()=>{loadOverview();loadCatalog();try{const saved=JSON.parse(window.localStorage.getItem('meulocal-acquisition-drafts-v3')||'null');if(saved&&Array.isArray(saved.drafts)&&saved.drafts.length){setPrepared(saved.drafts);setNiche(saved.niche||'');setRegion(saved.region||'');setMsg('Campanha recuperada. As mensagens foram preservadas; nenhum envio realizado.')}}catch{}},[]);
 const attention=useMemo(()=>data?data.kpis.onboardingPending+(data.infrastructure.ghlJobs||[]).filter((x:any)=>x.status==='failed').length+(data.infrastructure.syncLogs||[]).filter((x:any)=>x.status==='failed').length:0,[data]);
 const catalogById=useMemo(()=>new Map(catalog.map(d=>[d.id,d])),[catalog]);
 const filteredDiagnostics=useMemo(()=>{
  const overviewRows=data?.diagnostics||[];
  const overviewById=new Map(overviewRows.map((d:any)=>[d.id,d]));
  const rows=catalog.length?catalog.map(d=>({...overviewById.get(d.id),...d})):overviewRows;
  if(deliveryPeriod==='all')return rows;
  const since=new Date();
  if(deliveryPeriod==='week')since.setDate(since.getDate()-7);else since.setMonth(since.getMonth()-1);
  return rows.filter((d:any)=>new Date(d.first_contact_at||d.approved_at||d.created_at)>=since);
 },[data,catalog,deliveryPeriod]);
 const reviewableDiagnostics=useMemo(()=>{
  const q=diagnosticQuery.trim().toLocaleLowerCase('pt-BR');
  return catalog.filter(d=>(diagnosticStateFilter==='all'||d.contact.state===diagnosticStateFilter)&&
   (!q||(d.business_name+' '+(d.niche||'')+' '+(d.region||'')).toLocaleLowerCase('pt-BR').includes(q)));
 },[catalog,diagnosticQuery,diagnosticStateFilter]);

 async function search(e:FormEvent){e.preventDefault();setBusy(true);setMsg('');setSelected([]);setContactCheck([]);setRows([]);setPrepared([]);setDispatchPreview([]);setManualResults({});setManualAudit({});window.localStorage.removeItem('meulocal-acquisition-drafts-v3');try{const r=await fetch('/api/agents/prospect/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({niche,location:region})});const j=await r.json();if(!r.ok)throw new Error(j.error||'Falha na busca');setRows(j.candidates||[])}catch(e:any){setMsg(e.message)}finally{setBusy(false)}}
 async function prepareApproaches(){
  const companies=rows.filter(x=>selected.includes(x.id)).slice(0,10).map(x=>({id:x.id,name:x.name,address:x.address,rating:x.rating,reviews:x.reviews,score:x.score}));
  if(!companies.length)return;
  setBusy(true);setMsg('Preparando mensagens personalizadas com IA...');setPrepared([]);
  try{const drafts:{id:string;name:string;message:string}[]=[];for(let i=0;i<companies.length;i+=5){const batch=companies.slice(i,i+5);const res=await fetch('/api/agents/prospect/draft',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({niche,region,companies:batch})});const data=await res.json();if(!res.ok)throw Error(data.error||'Falha na geração');drafts.push(...data.drafts.map((x:{id:string;name:string;message:string})=>({id:x.id,name:x.name,message:x.message})));setPrepared([...drafts]);}window.localStorage.setItem('meulocal-acquisition-drafts-v3',JSON.stringify({niche,region,drafts}));setMsg(drafts.length+' de '+companies.length+' abordagens preparadas. Revise e verifique os canais; nenhum envio foi realizado.');}
  catch(e:any){setMsg('Não foi possível preparar mensagens: '+String(e.message||e));}
  finally{setBusy(false)}
 }
 async function sendManualProspect(p:{id:string;name:string;message:string}){
  const contact=contactCheck.find(x=>x.id===p.id);
  if(!contact?.canSend||!contact.sendToken){setMsg('Verifique o canal antes de enviar.');return}
  if(!window.confirm('Enviar UMA mensagem para '+p.name+' por '+(contact.channel==='email'?'e-mail':'WhatsApp')+' em '+contact.recipient+'?\n\n'+p.message+'\n\nNenhuma cadência automática será ativada.'))return;
  setBusy(true);setManualRetryable(s=>({...s,[p.id]:false}));setMsg('Preparando destinatário e conferindo o envio manual...');
  try{
   const attempt=await getManualAttempt(window.sessionStorage,{leadId:'places:'+p.id+':'+contact.recipient,channel:contact.channel==='email'?'email':'whatsapp',message:p.message});
   const response=await fetch('/api/agents/prospect/send-manual',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sendToken:contact.sendToken,requestId:attempt.requestId,message:p.message,confirmed:true})});
   const result=await response.json();if(!response.ok){
    const retryable=result.error==='acquisition_preparation_unavailable';
    setManualRetryable(s=>({...s,[p.id]:retryable}));
    setContactCheck(s=>s.map(c=>c.id===p.id?{...c,canSend:false,reason:retryable?'Falha técnica antes do envio. Verifique novamente o canal; a mesma tentativa será preservada.':'Confira o resultado da tentativa antes de reenviar.'}:c));
    throw Error((result.error||acquisitionFailure(result.error))+(result.failureStage?' Etapa registrada: '+result.failureStage+'.':'')+' Não reenvie antes de conferir o HighLevel.');
   }requireAcquisitionReceipt(result);
   setManualRetryable(s=>({...s,[p.id]:false}));
   // Retain this exact request ID after acceptance so reload/retry cannot duplicate it.
   setManualResults(s=>({...s,[p.id]:'Aceito pelo HighLevel. Recibo: '+result.messageId+'. Entrega ainda não confirmada.'}));
   setMsg('Mensagem aceita pelo HighLevel. Nenhuma cadência automática ativada.');await loadOverview();
  }catch(e:any){setContactCheck(s=>s.map(c=>c.id===p.id?{...c,canSend:false}:c));setManualResults(s=>({...s,[p.id]:String(e.message||e)}));setMsg(String(e.message||e))}finally{setBusy(false)}
 }
 async function inspectManualAttempt(p:{id:string;name:string}){
  if(busy)return;
  setBusy(true);setMsg('Conferindo a tentativa de '+p.name+' em modo somente leitura, sem enviar...');
  try{
   const response=await fetch('/api/agents/prospect/inspect-manual',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({placeId:p.id.replace(/^places\\//,'')})
   });
   const result=await response.json();
   if(!response.ok)throw Error(result.error||'Falha ao conferir a tentativa.');
   const last=result.attempts?.[0];
   const message=last?.interpretation||'Nenhuma tentativa de envio encontrada.';
   const provider=last?.providerContact==='found'?'Contato encontrado no HighLevel':
    last?.providerContact==='not_found'?'Contato não encontrado no HighLevel':
    'Cadastro no HighLevel não confirmado';
   const sendEvidence=last?.hasSendReceipt?'Existe registro de envio aceito pelo HighLevel.':
    'Sem recibo de envio no MeuLocal.';
   setManualAudit(prev=>({...prev,[p.id]:{message,provider,sendEvidence}}));
   setContactCheck(prev=>prev.map(c=>c.id===p.id?{...c,canSend:false,sendToken:null,reason:message}:c));
   setMsg(p.name+': '+message+' '+provider+'. Nenhum envio realizado pela conferência.');
  }catch(e:any){setManualAudit(prev=>({...prev,[p.id]:{
   message:'Histórico indisponível. Não repita o envio.',
   provider:'Situação no HighLevel não confirmada',
   sendEvidence:'Nenhuma nova tentativa autorizada.'
  }}));setMsg(String(e.message||e))}
  finally{setBusy(false)}
 }
 async function checkChannels(){
  const companies=(rows.length?rows.filter(x=>selected.includes(x.id)):prepared).slice(0,10).map(x=>({id:x.id,name:x.name}));
  if(!companies.length)return;
  setBusy(true);setContactCheck([]);setMsg('Verificando '+companies.length+' empresas, sem enviar mensagens...');
  const results:any[]=[];
  try{
   for(let i=0;i<companies.length;i+=5){
    const res=await fetch('/api/agents/prospect/contact-check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({companies:companies.slice(i,i+5)})});
    const json=await res.json();if(!res.ok)throw Error(json.error||'Falha na consulta');
    results.push(...(json.results||[]));setContactCheck([...results]);
   }
   const allowed=results.filter(x=>x.canSend).length;
   setMsg('Verificação de '+results.length+' empresas concluída: '+allowed+' apta(s) ao envio direto pelo HighLevel; '+(results.length-allowed)+' sem liberação. Telefones públicos não comprovam WhatsApp ou permissão. Nenhuma mensagem foi enviada.');
  }catch(e:any){setMsg('Verificação parcial de '+results.length+' empresas. '+String(e.message||e))}
  finally{setBusy(false)}
 }
 async function simulateDispatch(){if(!prepared.length)return;setBusy(true);setDispatchPreview([]);setMsg('Simulando envio, sem disparar mensagens...');try{const items=prepared.map(p=>{const candidate=rows.find(x=>x.name===p.name);const check=contactCheck.find(x=>x.name===p.name);return {id:candidate?.id||p.name,name:p.name,message:p.message,channel:(check?.channel||'blocked'),eligibilityStatus:check?.eligibilityStatus,eligibilityReasons:check?.eligibilityReasons||[]}});const r=await fetch('/api/agents/prospect/dispatch-preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items})});const data=await r.json();if(!r.ok)throw Error(data.error||'Simulação falhou');setDispatchPreview(data.results||[]);setMsg('SIMULAÇÃO concluída: '+data.results.length+' empresas; '+data.sent+' envios; '+data.results.filter((x:{status:string})=>x.status==='BLOCKED').length+' bloqueadas. Nenhuma mensagem foi enviada.');}catch(e:any){setMsg('Falha na simulação: '+String(e.message||e))}finally{setBusy(false)}}
 function toggle(id:string){setSelected(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id])}
 async function approve(){
  if(rows.some(x=>selected.includes(x.id)&&x.reviews===null)){setMsg('Confirme a quantidade de avaliações antes de salvar diagnósticos. Dados não informados não equivalem a zero. Você pode preparar uma abordagem consultiva sem essas afirmações.');return}
if(!selected.length)return;setBusy(true);setMsg('');try{
   const approved=rows.filter(x=>selected.includes(x.id)).map(x=>({id:x.id,name:x.name,address:x.address,rating:x.rating,reviews:x.reviews??undefined,score:x.score,website:x.website,phone:x.phone,competitorAverageReviews:x.competitorAverageReviews,niche,region,competitionMode:x.competitionMode,competitionLabel:x.competitionLabel,searchIntent:x.searchIntent}));
   const r=await fetch('/api/agents/prospect/approve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({approved,niche,location:region})});const j=await r.json();if(!r.ok)throw new Error(j.error||'Falha na aprovação');
   setMsg((j.diagnostics?.length||0)+' diagnóstico(s) salvo(s) para revisão. Nenhum contato iniciado.');setSelected([]);await loadCatalog();await loadOverview();
 }catch(e:any){setMsg(e.message)}finally{setBusy(false)}}
 async function prepareComparison(d:{id:string;business_name:string}){
  setBusy(true);setMsg('Preparando a análise comparativa de '+d.business_name+' sem enviar mensagens...');
  try{
   const r=await fetch('/api/admin/prospects/prepare-report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({diagnosticId:d.id})});
   const j=await r.json();if(!r.ok)throw Error(j.error||'Falha na análise');
   setGeneratedReports(items=>({...items,[d.id]:{url:j.report.url,count:j.report.competitorCount}}));await loadCatalog();
   setMsg('Análise da '+d.business_name+' pronta: '+j.report.competitorCount+' concorrente(s) válido(s) em até 3 km. Nenhuma mensagem enviada.');
  }catch(e:any){setMsg(String(e.message||e))}
  finally{setBusy(false)}
 }
 async function dispatchApproved(diagnostics?:any[]){
   const d=diagnostics?.[0];
   if(!d?.id||!d.public_token){setDiagMsg('Diagnóstico persistido indisponível. Atualize o painel.');return}
   if(!window.confirm('Aprovar contato inicial para '+d.business_name+'?\n\n'+initialAcquisitionMessage(d.business_name,d.public_token)))return;
   setBusy(true);setDiagMsg('');
   try{const r=await fetch('/api/agents/prospect/dispatch-pending',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({diagnosticIds:[d.id],confirmed:true})});
    const j=await r.json();if(!r.ok)throw Error(acquisitionFailure(j.error));requireAcquisitionReceipt(j);
    setDiagMsg('HighLevel aceitou o contato inicial. Recibo: '+j.messageId+' (entrega ainda não confirmada).');await loadOverview();
   }catch(e:any){setDiagMsg(e.message)}finally{setBusy(false)}
 }
 async function sendReply(d:any){
   const channel=d.reply?.channel,message=replyText;
   if(!message.trim()||!d.leadId||!['email','whatsapp'].includes(channel))return;
   if(!window.confirm('Aprovar resposta para '+d.business_name+' por '+channel+'?\n\n'+message))return;
   setBusy(true);setDiagMsg('');
   try{const attempt=await getManualAttempt(window.sessionStorage,{leadId:d.leadId,channel,message});
    const r=await fetch('/api/agents/prospect/reply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({leadId:d.leadId,requestId:attempt.requestId,message,channel,confirmed:true})});
    const j=await r.json();if(!r.ok)throw Error(acquisitionFailure(j.error));requireAcquisitionReceipt(j);clearManualAttempt(window.sessionStorage,attempt);
    setReplyingTo(null);setReplyText('');setDiagMsg('HighLevel aceitou a resposta. Recibo: '+j.messageId+' (entrega ainda não confirmada).');await loadOverview();
   }catch(e:any){setDiagMsg(e.message)}finally{setBusy(false)}
 }



 async function logout(){await fetch('/api/admin/session',{method:'DELETE'});window.location.href='/admin-login'}

 const nav=(id:View,Icon:any)=><button className={view===id?'active':''} onClick={()=>setView(id)}><Icon/>{labels[id]}</button>;

 return <main className="adminShell">
   <aside>
     <a className="adminBrand" href="/admin"><span><MapPin size={18}/></span>MeuLocal <b>Admin</b></a>
     <nav>
       {nav('overview',Gauge)}{nav('prospecting',Search)}{nav('leads',Users)}{nav('diagnostics',ClipboardCheck)}
       {nav('supervision',ShieldCheck)}{nav('customers',Building2)}{nav('automations',Workflow)}{nav('agents',Bot)}
       <a href="/admin/aprendizado"><Sparkles/>Aprendizado</a>
     </nav>
     <div className="adminSafety"><ShieldCheck/><div><strong>Operação protegida</strong><small>Admin separado da área do cliente. GHL e integrações ficam nos bastidores.</small></div></div>
     <button className="adminLogout" onClick={logout}><LogOut/>Sair</button>
   </aside>

   <section className="adminMain">
     <header>
       <div><span>CENTRO DE COMANDO</span><h1>{labels[view]}</h1><p>{view==='overview'?'A operação do MeuLocal em uma única tela.':view==='prospecting'?'Encontre e aprove oportunidades para abordagem.':'Dados reais da operação, sem precisar entrar no GHL.'}</p></div>
       <div className="headerActions"><button className="refreshBtn" onClick={loadOverview} disabled={loadingData}><RefreshCw/>Atualizar</button><div className={attention?'agentOnline attention':'agentOnline'}><i/> {dataError?'Consulta indisponível':loadingData?'Consultando operação':!data?'Operação não verificada':attention?attention+' ponto(s) de atenção':'Sem alertas na amostra consultada'}</div></div>
     </header>

     {dataError&&<div className="adminMessage error">{dataError}</div>}
     {loadingData&&!data&&<div className="adminLoading">Carregando operação...</div>}

     {view==='supervision'&&<OpenDotsSupervision/>}

     {view==='overview'&&data&&<>
       <p>Indicadores calculados sobre os registros recentes consultados; não representam totais históricos.</p>
       <div className="opsKpis">
         <article onClick={()=>setView('leads')}><span>Leads</span><strong>{data.kpis.leads}</strong><small>{data.kpis.conversations} em conversa</small></article>
         <article onClick={()=>setView('diagnostics')}><span>Diagnósticos abertos</span><strong>{data.kpis.diagnosticsOpen}</strong><small>{data.kpis.diagnosticConversions} convertidos</small></article>
         <article onClick={()=>setView('customers')}><span>Clientes ativos</span><strong>{data.kpis.customers}</strong><small>{data.kpis.onboardingPending} onboarding pendente</small></article>
         <article onClick={()=>setView('automations')}><span>Automações ativas</span><strong>{data.kpis.automationsActive}</strong><small>{data.kpis.paidCheckouts} checkouts pagos</small></article>
       </div>
       <div className="opsGrid">
         <section className="adminPanel"><div className="panelHead"><div><span>PRIORIDADE</span><h2>O que precisa da sua atenção</h2></div><Activity/></div>
           <div className="attentionRows">
             <button onClick={()=>setView('customers')}><b>{data.kpis.onboardingPending}</b><span>Clientes com onboarding pendente</span></button>
             <button onClick={()=>setView('leads')}><b>{data.kpis.conversations}</b><span>Leads em conversa / qualificados</span></button>
             <button onClick={()=>setView('agents')}><b>{data.infrastructure.ghlJobs.filter((x:any)=>x.status==='failed').length}</b><span>Falhas de provisionamento GHL</span></button>
             <button onClick={()=>setView('agents')}><b>{data.infrastructure.syncLogs.filter((x:any)=>x.status==='failed').length}</b><span>Falhas recentes de sincronização Google</span></button>
           </div>
         </section>
         <section className="adminPanel"><div className="panelHead"><div><span>ATIVIDADE</span><h2>Últimos movimentos</h2></div></div>
           <div className="activityList">{data.activity.length?data.activity.slice(0,8).map((a:any,i:number)=><div key={i}><i/><div><strong>{a.title}</strong><span>{a.detail}</span></div><time>{fmtDate(a.at)}</time></div>):<p className="empty">Nenhuma atividade registrada ainda.</p>}</div>
         </section>
       </div>
       <section className="adminPanel"><div className="panelHead"><div><span>AGENTES & INFRAESTRUTURA</span><h2>Status operacional</h2></div><button className="textBtn" onClick={()=>setView('agents')}>Ver detalhes</button></div>
         <div className="agentCards">{data.agents.map((a:any)=><article key={a.name}><div className={'agentState '+a.status}/><div><strong>{a.name}</strong><span>{a.detail}</span></div><Pill value={a.status}/></article>)}</div>
       </section>
     </>}

     {view==='prospecting'&&<>
       <form className="commandCard" onSubmit={search}><div className="commandIcon"><Bot/></div><div className="commandFields"><label>O que você quer prospectar?<input value={niche} onChange={e=>setNiche(e.target.value)} placeholder="Ex.: empresas que alugam geradores" required/></label><label>Onde?<input value={region} onChange={e=>setRegion(e.target.value)} placeholder="Ex.: Moema, São Paulo, SP" required/></label></div><button disabled={busy}>{busy?'Pesquisando...':'Buscar oportunidades'} <ArrowUpRight/></button></form>
       {msg&&<div className="adminMessage">{msg}</div>}
       <section className="adminPanel" style={{marginBottom:18,padding:20}}>
        <div className="panelHead"><div><span>HISTÓRICO DE PROSPECÇÃO</span><h2>Diagnósticos salvos e situação de contato</h2></div><b>{catalog.length}</b></div>
        <p style={{fontSize:13,color:'#617068',marginBottom:14}}>Salvar uma empresa não envia mensagem. “Envio registrado” indica um evento no HighLevel, mas não comprova entrega ao destinatário.</p>
        <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:12,alignItems:'flex-end'}}>
         <label style={{flex:'1 1 250px',fontSize:12,fontWeight:600}}>Buscar empresa salva
          <input aria-label="Buscar diagnóstico por nome" type="search" value={diagnosticQuery} onChange={e=>setDiagnosticQuery(e.target.value)} placeholder="Ex.: Wizard Cursino" style={{display:'block',width:'100%',padding:10,border:'1px solid #d4ddd4',borderRadius:7,marginTop:4}}/>
         </label>
         <label style={{flex:'1 1 230px',fontSize:12,fontWeight:600}}>Situação do contato
          <select aria-label="Filtrar situação de contato" value={diagnosticStateFilter} onChange={e=>setDiagnosticStateFilter(e.target.value)} style={{display:'block',width:'100%',padding:10,border:'1px solid #d4ddd4',borderRadius:7,marginTop:4}}>
           <option value="all">Todas as situações</option><option value="saved">Salvo, sem envio registrado</option>
           <option value="queued">Na fila, envio não confirmado</option><option value="sent">Envio registrado</option>
           <option value="delivered">Entrega registrada</option><option value="replied">Resposta registrada</option><option value="failed">Falha registrada</option>
          </select>
         </label>
         <button type="button" className="textBtn" disabled={busy||catalogLoading} onClick={()=>loadCatalog()}>Atualizar histórico</button>
        </div>
        {catalogLoading&&<p role="status">Conferindo diagnósticos e registros de contato...</p>}
        {catalogError&&<p role="alert" style={{color:'#92400e'}}>Não foi possível verificar os registros: {catalogError}. O status do envio permanece desconhecido.</p>}
        {!catalogLoading&&!catalogError&&<>
         <p style={{fontSize:12,color:'#5c6a5f'}}>Exibindo {Math.min(reviewableDiagnostics.length,20)} de {reviewableDiagnostics.length} diagnóstico(s) encontrado(s). Use a busca para localizar qualquer um dos {catalog.length} salvos.</p>
         <div style={{display:'grid'}}>
          {reviewableDiagnostics.slice(0,20).map(d=>{
           const report=generatedReports[d.id];
           const valid=Boolean(report||d.reportReady);
           const count=report?.count||d.reportCount;
           return <div key={d.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,flexWrap:'wrap',padding:'12px 0',borderBottom:'1px solid #e8ece7'}}>
            <div style={{flex:'1 1 230px',minWidth:0}}>
             <strong style={{display:'block',fontSize:14}}>{d.business_name}</strong>
             <small style={{display:'block',color:'#7a867c'}}>{d.niche||d.region||'Negócio local'}</small>
             <small style={{display:'block',fontWeight:600,color:d.contact.state==='saved'?'#68736a':'#405b45'}}>{d.contact.label}{d.contact.evidenceAt?' · '+fmtDate(d.contact.evidenceAt):''}</small>
            </div>
            <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
             <a href={d.url} target="_blank" rel="noopener noreferrer">Ver diagnóstico</a>
             <button className="approveBtn" type="button" disabled={busy||['converted','closed'].includes(d.status||'')} onClick={()=>prepareComparison(d)}>{valid?'Atualizar análise':'Gerar análise (sem enviar)'}</button>
             {valid&&<a href={report?.url||d.url} target="_blank" rel="noopener noreferrer">Ver comparação ({count})</a>}
            </div>
           </div>;
          })}
          {!reviewableDiagnostics.length&&<p className="empty">Nenhum diagnóstico corresponde à busca.</p>}
         </div>
        </>}
        <p style={{fontSize:12,color:'#68746a',marginTop:12}}>Gerar a análise consulta dados públicos do Google. Nenhum contato, régua ou mensagem é iniciado por esta ação.</p>
       </section>
       {(rows.length>0||prepared.length>0)&&<><div className="resultHeader"><div><span>OPORTUNIDADES ENCONTRADAS</span><h2>Empresas encontradas — você escolhe</h2><p>Nenhuma empresa é selecionada automaticamente. Escolha quais deseja abordar e revise os rascunhos.</p></div><button className="textBtn" type="button" onClick={approve} disabled={!selected.length||busy}>Salvar diagnósticos {selected.length||''}</button><button className="approveBtn" onClick={prepareApproaches} disabled={!selected.length||busy}><Check/> Preparar abordagens {selected.length||''}</button></div>{prepared.length>0&&<div style={{marginBottom:12,display:"flex",gap:12,flexWrap:"wrap",alignItems:"center"}}><button className="approveBtn" type="button" onClick={checkChannels} disabled={busy}>Verificar e-mail / WhatsApp (sem enviar)</button> {dispatchPreview.length>0&&<section className="adminPanel" style={{padding:16,flexBasis:'100%'}}><h3>Resultado da simulação — zero envios</h3>{dispatchPreview.map((x,i)=><p key={i}><strong>{x.name}:</strong> {x.status} — {x.reasons.join(', ')}</p>)}</section>}{contactCheck.length>0&&<section className="adminPanel" style={{padding:16,marginTop:12}}><h3>Canais para envio manual</h3><p>{contactCheck.filter(c=>c.canSend).length} aptos ao envio pelo HighLevel de {contactCheck.length} verificados. Sem liberação, o envio permanece bloqueado, inclusive por WhatsApp manual. Um telefone público não comprova WhatsApp válido nem autorização de contato.</p>{contactCheck.map(c=><p key={c.id}><strong>{c.name}:</strong> <span style={{color:c.canSend&&(!manualResults[c.id]||manualRetryable[c.id])?'#166534':'#92400e',fontWeight:600}}>{c.canSend&&(!manualResults[c.id]||manualRetryable[c.id])?'● Pode enviar':'● Não pode enviar'}</span> — {c.recipient||c.email||c.phone||'Sem canal confirmado'} — {c.reason}</p>)}<p>O cadastro necessário no HighLevel é preparado ao confirmar o envio. Nenhuma mensagem ou cadência é disparada nesta verificação.</p></section>}</div>}{prepared.length>0&&<section className="adminPanel" style={{marginBottom:16,padding:20}}><h3>Abordagens para revisão — sem envio</h3><p>Confira o destinatário e a mensagem. Cada envio depende da sua confirmação; não há prospecção autônoma.</p>{prepared.map((p,i)=><article key={i} style={{marginTop:12,padding:12,border:'1px solid #ddd',borderRadius:8}}><strong>{p.name}</strong><p style={{whiteSpace:'pre-wrap'}}>{p.message}</p>{(() => {const c=contactCheck.find(x=>x.id===p.id);return <><p style={{fontSize:13,fontWeight:600,color:c?.canSend&&(!manualResults[p.id]||manualRetryable[p.id])?'#166534':'#92400e'}}>{c?.canSend&&(!manualResults[p.id]||manualRetryable[p.id])?'● Pode enviar — '+(c.channel==='email'?'E-mail':'WhatsApp'):'● Não pode enviar — '+(manualResults[p.id]?'Confira o resultado da tentativa abaixo.':(c?.reason||'Verifique o e-mail / WhatsApp primeiro.'))}</p>{c?.recipient&&<p>{c.recipient}</p>}{manualResults[p.id]&&<p role="status">{manualResults[p.id]}</p>}{manualResults[p.id]&&!manualResults[p.id].includes('Aceito pelo HighLevel')&&<button type="button" disabled={busy} onClick={()=>inspectManualAttempt(p)}>Conferir tentativa (sem enviar)</button>}{manualAudit[p.id]&&<div role="status" style={{fontSize:13,padding:12,border:'1px solid #d9a441',background:'#fffaf0',borderRadius:7,margin:'8px 0'}}><strong>{manualAudit[p.id].sendEvidence}</strong><p>{manualAudit[p.id].message}</p><small>{manualAudit[p.id].provider}. Não realize um novo envio sem confirmar o destinatário correto.</small></div>}<button type="button" onClick={()=>navigator.clipboard.writeText(p.message)}>Copiar mensagem</button>{' '}<button type="button" disabled={busy||!c?.canSend||!!manualResults[p.id]&&!manualRetryable[p.id]} onClick={()=>sendManualProspect(p)}>Enviar {c?.channel==='whatsapp'?'WhatsApp':'e-mail'} pelo HighLevel</button></>})()}</article>)}</section>}<div className="prospectList">{rows.map((r,i)=><article key={r.id} className={selected.includes(r.id)?'selected':''} onClick={()=>toggle(r.id)}><div className="selectBox">{selected.includes(r.id)&&<Check/>}</div><div className="rank">#{i+1}</div><div className="prospectInfo"><strong>{r.name}</strong><span>{r.address}</span><small>{r.rating?'★ '+r.rating:'Sem nota'} · {r.reviews===null?'Quantidade de avaliações não informada':r.reviews+' avaliações'}</small></div><div className="scoreBox"><span>Score MeuLocal</span><strong>{r.reviews===null?'—':r.score}<small>{r.reviews===null?'':'/100'}</small></strong><em>{r.reviews===null?'dados insuficientes':r.priority.replaceAll('_',' ')}</em></div></article>)}</div></>}
     </>}

     {view==='leads'&&data&&<section className="adminPanel tablePanel"><div className="panelHead"><div><span>FUNIL COMERCIAL</span><h2>Leads</h2></div><b>{data.leads.length}</b></div><div className="adminTable"><div className="tableRow tableHead"><span>Empresa / contato</span><span>Etapa</span><span>Automação</span><span>Próxima ação</span></div>{data.leads.map((l:any)=><div className="tableRow" key={l.id}><span><strong>{l.business?.name||l.name||'Sem empresa'}</strong><small>{l.email||l.whatsapp||'Sem contato'}</small></span><span><Pill value={l.lifecycle_stage}/></span><span>{l.automation_track||'—'}</span><span>{fmtDate(l.next_action_at)}</span></div>)}</div>{!data.leads.length&&<p className="empty">Nenhum lead ainda.</p>}</section>}

     {view==='diagnostics'&&data&&<><section className="adminPanel repliesPanel"><div className="panelHead"><div><span>CAIXA DE ENTRADA</span><h2>Respostas recebidas</h2></div><b>{filteredDiagnostics.filter((d:any)=>d.reply).length}</b></div>{filteredDiagnostics.filter((d:any)=>d.reply).length?filteredDiagnostics.filter((d:any)=>d.reply).map((d:any)=><article className="replyCard" key={d.id}><div><strong>{d.business_name}</strong><small><Pill value="conversation"/> · {d.reply.channel==='whatsapp'?'WhatsApp':'E-mail'} · {fmtDate(d.reply.at)}</small><p>{d.reply.preview||'Resposta recebida. O conteúdo ainda não foi disponibilizado pelo canal.'}</p></div>{replyingTo===d.id?<div className="replyComposer"><textarea value={replyText} onChange={e=>setReplyText(e.target.value)} placeholder="Escreva a resposta..."/><div><button className="textBtn" onClick={()=>{setReplyingTo(null);setReplyText('')}}>Cancelar</button><button className="replySend" disabled={busy||!replyText.trim()} onClick={()=>sendReply(d)}><Send/>Enviar</button></div></div>:<button className="textBtn" disabled={!d.leadId} onClick={()=>{setReplyingTo(d.id);setReplyText('')}}>Responder</button>}</article>):<p className="empty">Nenhuma resposta ainda. Assim que alguém responder, ela aparecerá aqui.</p>}</section><section className="adminPanel tablePanel"><div className="panelHead"><div><span>DIAGNÓSTICOS</span><h2>Histórico de oportunidades</h2></div><div className="diagnosticActions"><select aria-label="Período dos diagnósticos" value={deliveryPeriod} onChange={e=>setDeliveryPeriod(e.target.value as 'all'|'week'|'month')}><option value="all">Todos (até hoje)</option><option value="week">Últimos 7 dias</option><option value="month">Últimos 30 dias</option></select><button className="textBtn" type="button" disabled={busy||!data.diagnostics.some((d:any)=>d.status==='approved')} onClick={()=>dispatchApproved(data.diagnostics.filter((d:any)=>d.status==='approved'))}>Disparar próximo aprovado</button></div></div>{diagMsg&&<div className="adminMessage">{diagMsg}</div>}<div className="adminTable"><div className="tableRow tableHead diagCols"><span>Empresa</span><span>Score</span><span>Envio</span><span>Etapa da régua</span><span>Contato em</span><span>Abertura confirmada</span><span>CTA</span></div>{filteredDiagnostics.map((d:any)=><div className="tableRow diagCols" key={d.id}><span><strong>{d.business_name}</strong><small>{d.niche||d.region||'—'}</small>{d.delivery?.reason&&<small className="deliveryReason">{d.delivery.reason}</small>}{d.status==='approved'&&<button className="textBtn acquisitionBtn" type="button" disabled={busy} onClick={()=>dispatchApproved([d])}>Revisar contato inicial</button>}{d.public_token&&<><a href={'/d/'+d.public_token} target="_blank" rel="noopener noreferrer">Ver diagnóstico</a>{' '}<button className="textBtn acquisitionBtn" type="button" disabled={busy} onClick={()=>prepareComparison({id:d.id,business_name:d.business_name})}>Gerar análise (sem enviar)</button>{generatedReports[d.id]&&<a href={generatedReports[d.id].url} target="_blank" rel="noopener noreferrer">Ver comparação ({generatedReports[d.id].count})</a>}</>}</span><span><b>{d.score}/100</b></span><span>{catalogById.get(d.id)?.contact?<span title="Registro de contato vinculado a este diagnóstico; não implica confirmação de entrega">{catalogById.get(d.id)!.contact.label}</span>:<span>Não verificado</span>}</span><span><Pill value={d.cadence}/></span><span>{fmtDate(d.delivery?.at||d.first_contact_at)}</span><span>{fmtDate(d.diagnostic_opened_at)}</span><span>{fmtDate(d.cta_clicked_at)}</span></div>)}</div>{!filteredDiagnostics.length&&<p className="empty">Nenhum diagnóstico neste período.</p>}</section></>}

     {view==='customers'&&data&&<section className="adminPanel tablePanel"><div className="panelHead"><div><span>CARTEIRA</span><h2>Clientes</h2></div><b>{data.customers.length}</b></div><div className="adminTable"><div className="tableRow tableHead customerCols"><span>Empresa</span><span>Pagamento</span><span>Onboarding</span><span>Google</span><span>GHL</span></div>{data.customers.map((c:any)=><div className="tableRow customerCols" key={c.id}><span><strong>{c.business?.name||'Empresa'}</strong><small>{c.business?.city||c.business?.address||'—'}</small></span><span><Pill value={c.payment_status}/></span><span><Pill value={c.onboarding_status}/></span><span>{c.google?<Pill value={c.google.status}/>:<span className="muted">Não conectado</span>}</span><span>{c.ghl?<Pill value={c.ghl.lifecycle_status}/>:<span className="muted">Não provisionado</span>}</span></div>)}</div>{!data.customers.length&&<p className="empty">Nenhum cliente ativado ainda.</p>}</section>}

     {view==='automations'&&data&&<section className="adminPanel tablePanel"><div className="panelHead"><div><span>RÉGUAS</span><h2>Automações</h2></div><b>{data.automations.length}</b></div><div className="adminTable"><div className="tableRow tableHead"><span>Empresa / lead</span><span>Régua</span><span>Status</span><span>Próxima execução</span></div>{data.automations.map((a:any)=><div className="tableRow" key={a.id}><span><strong>{a.business?.name||a.lead?.email||'Lead'}</strong><small>Etapa {a.step??0}</small></span><span>{a.track}</span><span><Pill value={a.status}/></span><span>{fmtDate(a.next_run_at)}</span></div>)}</div>{!data.automations.length&&<p className="empty">Nenhuma automação ativa ou histórica ainda.</p>}</section>}

     {view==='agents'&&data&&<>
       <div className="agentCards large">{data.agents.map((a:any)=><article key={a.name}><div className={'agentState '+a.status}/><div><strong>{a.name}</strong><span>{a.detail}</span></div><Pill value={a.status}/></article>)}</div>
       <div className="opsGrid">
         <section className="adminPanel"><div className="panelHead"><div><span>GHL</span><h2>Provisionamento</h2></div></div><div className="infraList">{data.infrastructure.ghlJobs.length?data.infrastructure.ghlJobs.slice(0,12).map((j:any)=><div key={j.id}><Pill value={j.status}/><span>{j.requested_mode}</span><time>{fmtDate(j.requested_at)}</time></div>):<p className="empty">Nenhum job de GHL registrado.</p>}</div></section>
         <section className="adminPanel"><div className="panelHead"><div><span>GOOGLE</span><h2>Sincronizações</h2></div></div><div className="infraList">{data.infrastructure.syncLogs.length?data.infrastructure.syncLogs.slice(0,12).map((j:any)=><div key={j.id}><Pill value={j.status}/><span>{j.source}{j.score!=null?' · Score '+j.score:''}</span><time>{fmtDate(j.created_at)}</time></div>):<p className="empty">Nenhuma sincronização registrada.</p>}</div></section>
       </div>
     </>}
   </section>
 </main>
}
