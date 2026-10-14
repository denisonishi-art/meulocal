'use client';
import {FormEvent,useEffect,useMemo,useRef,useState} from 'react';
import {
  Activity,ArrowUpRight,Bot,Building2,Check,ClipboardCheck,
  Gauge,LogOut,MapPin,RefreshCw,Search,Send,ShieldCheck,Sparkles,Users,Workflow
} from 'lucide-react';

type Candidate={id:string;name:string;address:string;rating:number|null;reviews:number;website:string|null;phone:string|null;score:number;priority:string;competitorAverageReviews?:number|null;competitionMode?:'local_radius'|'city_region'|'search_market';competitionLabel?:string|null;searchIntent?:string|null};
type View='overview'|'prospecting'|'leads'|'diagnostics'|'customers'|'automations'|'agents';
type Overview={
  kpis:{leads:number;conversations:number;customers:number;onboardingPending:number;automationsActive:number;diagnosticsOpen:number;diagnosticConversions:number;paidCheckouts:number};
  leads:any[];diagnostics:any[];customers:any[];automations:any[];activity:any[];agents:any[];
  infrastructure:{ghlJobs:any[];syncLogs:any[]};
};

const labels:Record<View,string>={
  overview:'Visão geral',prospecting:'Prospecção',leads:'Leads',diagnostics:'Diagnósticos',
  customers:'Clientes',automations:'Automações',agents:'Agentes'
};

function fmtDate(v?:string|null){if(!v)return '—';return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(v))}
function statusLabel(v?:string|null){
  const map:Record<string,string>={lead:'Lead',mql:'Qualificado',conversation:'Em conversa',customer:'Cliente',nurture:'Nutrição',lost:'Perdido',active:'Ativo',pending:'Pendente',in_progress:'Em andamento',completed:'Concluído',paid:'Pago',past_due:'Em atraso',canceled:'Cancelado',approved:'Aprovado',contacted:'Contatado',converted:'Convertido',online:'Online',attention:'Atenção',idle:'Aguardando',failed:'Falhou',success:'Sucesso',linked:'Conectado',error:'Erro',provisioning:'Provisionando'};
  return map[v||'']||String(v||'—').replaceAll('_',' ');
}
function Pill({value}:{value?:string|null}){const key=(value||'').replaceAll('_','-');return <span className={'statusPill '+key}>{statusLabel(value)}</span>}
function DeliveryPill({delivery}:{delivery?:any}){const state=delivery?.state||'pending';const label=state==='contacted'?`Na régua${delivery?.channel?` · ${delivery.channel}`:''}`:state==='error'?`Erro${delivery?.channel?` · ${delivery.channel}`:''}`:state==='converted'?'Convertido':'Pendente';return <span className={'statusPill '+(state==='contacted'?'active':state==='error'?'error':state==='converted'?'converted':'pending')} title={delivery?.reason||label}>{label}</span>}

export default function AdminClient(){
 const[prepared,setPrepared]=useState<Array<{name:string;message:string}>>([]);
 const[contactCheck,setContactCheck]=useState<Array<{name:string;channel:string;email?:string|null;phoneFound?:boolean;reason:string;ghlStatus?:string;eligibilityStatus?:string;eligibilityReasons?:string[]}>>([]);
 const[view,setView]=useState<View>('overview');const recoveredApproved=useRef(false);
 const[data,setData]=useState<Overview|null>(null);const[loadingData,setLoadingData]=useState(true);const[dataError,setDataError]=useState('');
 const[niche,setNiche]=useState('');const[region,setRegion]=useState('');const[rows,setRows]=useState<Candidate[]>([]);const[selected,setSelected]=useState<string[]>([]);const[busy,setBusy]=useState(false);const[msg,setMsg]=useState('');const[diagMsg,setDiagMsg]=useState('');const[deliveryPeriod,setDeliveryPeriod]=useState<'all'|'week'|'month'>('all');const[replyingTo,setReplyingTo]=useState<string|null>(null);const[replyText,setReplyText]=useState('');

 async function loadOverview(){setLoadingData(true);setDataError('');try{const r=await fetch('/api/admin/overview',{cache:'no-store'});const j=await r.json();if(!r.ok)throw new Error(j.error||'Falha ao carregar operação');setData(j)}catch(e:any){setDataError(e.message)}finally{setLoadingData(false)}}
 useEffect(()=>{loadOverview()},[]);
 const attention=useMemo(()=>data?data.kpis.onboardingPending+(data.infrastructure.ghlJobs||[]).filter((x:any)=>x.status==='failed').length+(data.infrastructure.syncLogs||[]).filter((x:any)=>x.status==='failed').length:0,[data]);
 const filteredDiagnostics=useMemo(()=>{const rows=data?.diagnostics||[];if(deliveryPeriod==='all')return rows;const since=new Date();if(deliveryPeriod==='week')since.setDate(since.getDate()-7);else since.setMonth(since.getMonth()-1);return rows.filter((d:any)=>new Date(d.first_contact_at||d.approved_at||d.created_at)>=since)},[data,deliveryPeriod]);

 async function search(e:FormEvent){e.preventDefault();setBusy(true);setMsg('');setSelected([]);setPrepared([]);setContactCheck([]);try{const r=await fetch('/api/agents/prospect/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({niche,location:region})});const j=await r.json();if(!r.ok)throw new Error(j.error||'Falha na busca');setRows(j.candidates||[])}catch(e:any){setMsg(e.message)}finally{setBusy(false)}}
 async function prepareApproaches(){
  const companies=rows.filter(x=>selected.includes(x.id)).slice(0,5).map(x=>({id:x.id,name:x.name,address:x.address,rating:x.rating,reviews:x.reviews,score:x.score}));
  if(!companies.length)return;
  setBusy(true);setMsg('Preparando mensagens personalizadas com IA...');setPrepared([]);
  try{const res=await fetch('/api/agents/prospect/draft',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({niche,region,companies})});const data=await res.json();if(!res.ok)throw Error(data.error||'Falha na geração');setPrepared(data.drafts.map((x:{name:string;message:string})=>({name:x.name,message:x.message})));setMsg('Abordagens personalizadas geradas por IA para revisão. Nenhuma mensagem foi enviada.');}
  catch(e:any){setMsg('Não foi possível preparar mensagens: '+String(e.message||e));}
  finally{setBusy(false)}
 }
 async function checkChannels(){const companies=rows.filter(x=>selected.includes(x.id)).slice(0,5).map(x=>({id:x.id,name:x.name}));if(!companies.length)return;setBusy(true);setContactCheck([]);setMsg('Verificando canais comerciais, sem enviar mensagens...');try{const res=await fetch('/api/agents/prospect/contact-check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({companies})});const json=await res.json();if(!res.ok)throw Error(json.error||'Falha na consulta');setContactCheck(json.results||[]);setMsg('Consulta concluída. Canais encontrados ainda não representam autorização para contato; nenhum envio foi realizado.');}catch(e:any){setMsg('Falha ao verificar canais: '+String(e.message||e))}finally{setBusy(false)}}
 async function simulateDispatch(){if(!prepared.length)return;setBusy(true);try{const items=prepared.map(p=>{const candidate=rows.find(x=>x.name===p.name);const check=contactCheck.find(x=>x.name===p.name);return {id:candidate?.id||p.name,name:p.name,message:p.message,channel:(check?.channel||'blocked'),eligibilityStatus:check?.eligibilityStatus,eligibilityReasons:check?.eligibilityReasons||[]}});const r=await fetch('/api/agents/prospect/dispatch-preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items})});const data=await r.json();if(!r.ok)throw Error(data.error||'Simulação falhou');setMsg('SIMULAÇÃO concluída: '+data.results.length+' empresas; '+data.sent+' envios; '+data.results.filter((x:{status:string})=>x.status==='BLOCKED').length+' bloqueadas. Nenhuma mensagem foi enviada.');}catch(e:any){setMsg('Falha na simulação: '+String(e.message||e))}finally{setBusy(false)}}
 function toggle(id:string){setSelected(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id])}
 async function approve(){if(!selected.length)return;setBusy(true);setMsg('');try{
   const approved=rows.filter(x=>selected.includes(x.id)).map(x=>({id:x.id,name:x.name,address:x.address,rating:x.rating,reviews:x.reviews,score:x.score,website:x.website,phone:x.phone,competitorAverageReviews:x.competitorAverageReviews,niche,region,competitionMode:x.competitionMode,competitionLabel:x.competitionLabel,searchIntent:x.searchIntent}));
   const r=await fetch('/api/agents/prospect/approve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({approved,niche,location:region})});const j=await r.json();if(!r.ok)throw new Error(j.error||'Falha na aprovação');
   const started=Number(j.contactStarted||0);const pending=Number(j.diagnostics?.length||0)-started;
   setMsg(selected.length+' prospect'+(selected.length>1?'s':'')+' processado'+(selected.length>1?'s':'')+'. '+started+' contato'+(started!==1?'s':'')+' entrou'+(started!==1?'aram':'')+' automaticamente na régua GHL.'+(pending>0?' '+pending+' ficou'+(pending!==1?'ram':'')+' pendente'+(pending!==1?'s':'')+' por não haver e-mail público no site.':''));setSelected([]);await loadOverview();
 }catch(e:any){setMsg(e.message)}finally{setBusy(false)}}
 async function dispatchApproved(diagnostics?:any[]){
   setBusy(true);setDiagMsg('');
   try{
     const r=await fetch('/api/agents/prospect/dispatch-pending',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({diagnosticIds:diagnostics?.map(d=>d.id)})});
     const j=await r.json();if(!r.ok)throw new Error(j.error||'Não foi possível iniciar a régua.');
     const sent=Number(j.contactStarted||0),pending=Number(j.processed||0)-sent;
     setDiagMsg(sent+' contato'+(sent!==1?'s':'')+' entrou'+(sent!==1?'aram':'')+' na régua do GHL.'+(pending?' '+pending+' ficou'+(pending!==1?'ram':'')+' pendente'+(pending!==1?'s':'')+' sem e-mail público encontrado.':''));
     await loadOverview();
   }catch(e:any){setDiagMsg(e.message)}finally{setBusy(false)}
 }
 async function sendReply(d:any){
   if(!replyText.trim()||!d.leadId)return;setBusy(true);setDiagMsg('');
   try{const r=await fetch('/api/agents/prospect/reply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({leadId:d.leadId,message:replyText,channel:d.reply?.channel})});const j=await r.json();if(!r.ok)throw new Error(j.error||'Não foi possível enviar a resposta.');setReplyingTo(null);setReplyText('');setDiagMsg(`Resposta enviada por ${j.channel==='whatsapp'?'WhatsApp':'e-mail'}.`);await loadOverview()}catch(e:any){setDiagMsg(e.message)}finally{setBusy(false)}
 }

 useEffect(()=>{
   const pending=(data?.diagnostics||[]).filter((d:any)=>d.status==='approved');
   if(!recoveredApproved.current&&pending.length){recoveredApproved.current=true;void dispatchApproved(pending)}
 },[data]);

 async function logout(){await fetch('/api/admin/session',{method:'DELETE'});window.location.href='/admin-login'}

 const nav=(id:View,Icon:any)=><button className={view===id?'active':''} onClick={()=>setView(id)}><Icon/>{labels[id]}</button>;

 return <main className="adminShell">
   <aside>
     <a className="adminBrand" href="/admin"><span><MapPin size={18}/></span>MeuLocal <b>Admin</b></a>
     <nav>
       {nav('overview',Gauge)}{nav('prospecting',Search)}{nav('leads',Users)}{nav('diagnostics',ClipboardCheck)}
       {nav('customers',Building2)}{nav('automations',Workflow)}{nav('agents',Bot)}
       <a href="/admin/aprendizado"><Sparkles/>Aprendizado</a>
     </nav>
     <div className="adminSafety"><ShieldCheck/><div><strong>Operação protegida</strong><small>Admin separado da área do cliente. GHL e integrações ficam nos bastidores.</small></div></div>
     <button className="adminLogout" onClick={logout}><LogOut/>Sair</button>
   </aside>

   <section className="adminMain">
     <header>
       <div><span>CENTRO DE COMANDO</span><h1>{labels[view]}</h1><p>{view==='overview'?'A operação do MeuLocal em uma única tela.':view==='prospecting'?'Encontre e aprove oportunidades para abordagem.':'Dados reais da operação, sem precisar entrar no GHL.'}</p></div>
       <div className="headerActions"><button className="refreshBtn" onClick={loadOverview} disabled={loadingData}><RefreshCw/>Atualizar</button><div className={attention?'agentOnline attention':'agentOnline'}><i/> {attention?attention+' ponto(s) de atenção':'Operação normal'}</div></div>
     </header>

     {dataError&&<div className="adminMessage error">{dataError}</div>}
     {loadingData&&!data&&<div className="adminLoading">Carregando operação...</div>}

     {view==='overview'&&data&&<>
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
       <form className="commandCard" onSubmit={search}><div className="commandIcon"><Bot/></div><div className="commandFields"><label>O que você quer prospectar?<input value={niche} onChange={e=>setNiche(e.target.value)} placeholder="Ex.: empresas que alugam geradores" required/></label><label>Onde?<input value={region} onChange={e=>setRegion(e.target.value)} placeholder="Ex.: São Paulo, SP" required/></label></div><button disabled={busy}>{busy?'Pesquisando...':'Buscar oportunidades'} <ArrowUpRight/></button></form>
       {msg&&<div className="adminMessage">{msg}</div>}
       {rows.length>0&&<><div className="resultHeader"><div><span>OPORTUNIDADES ENCONTRADAS</span><h2>Prioridade sugerida pelo MeuLocal</h2><p>Selecione empresas e prepare abordagens para revisão, sem disparos automáticos.</p></div><button className="approveBtn" onClick={prepareApproaches} disabled={!selected.length||busy}><Check/> Preparar abordagens {selected.length||''}</button></div>{prepared.length>0&&<div style={{marginBottom:12}}><button className="approveBtn" type="button" onClick={checkChannels} disabled={busy}>Verificar e-mail / WhatsApp (sem enviar)</button> <button className="approveBtn" type="button" onClick={simulateDispatch} disabled={busy||!contactCheck.length}>Simular disparo (não envia)</button>{contactCheck.length>0&&<section className="adminPanel" style={{padding:16,marginTop:12}}><h3>Pré-verificação de canais — nenhum disparo</h3>{contactCheck.map((c,i)=><p key={i}><strong>{c.name}:</strong> {c.channel==='email'?'E-mail encontrado':c.channel==='whatsapp'?'Telefone encontrado; confirmar WhatsApp comercial':'Sem canal confirmado'} — {c.reason}</p>)}<p>Esta é apenas uma pré-verificação, não uma simulação de entrega. Nenhum contato foi criado e nenhuma mensagem foi enviada. O disparo exige confirmação do canal, opt-out e autorização.</p></section>}</div>}{prepared.length>0&&<section className="adminPanel" style={{marginBottom:16,padding:20}}><h3>Abordagens para revisão — sem envio</h3><p>Rascunhos personalizados por IA, pendentes de revisão. Ainda não há envio pelo HighLevel. A execução pelo agente OpenDots continua em integração.</p>{prepared.map((p,i)=><article key={i} style={{marginTop:12,padding:12,border:'1px solid #ddd',borderRadius:8}}><strong>{p.name}</strong><p style={{whiteSpace:'pre-wrap'}}>{p.message}</p><p style={{fontSize:13,fontWeight:600}}>{(() => { const c=contactCheck.find(x=>x.name===p.name); return !c?'Pré-envio: canal ainda não verificado · NÃO ENVIADO':c.channel==='email'?'Pré-envio: e-mail encontrado · BLOQUEADO até checagem no HighLevel':c.channel==='whatsapp'?'Pré-envio: telefone encontrado · BLOQUEADO: WhatsApp, restrições e autorização não verificados':'Pré-envio: BLOQUEADO · contato não identificado'; })()}</p><p style={{fontSize:12}}>{contactCheck.find(x=>x.name===p.name)?.ghlStatus?'HighLevel: '+contactCheck.find(x=>x.name===p.name)?.ghlStatus+' · '+(contactCheck.find(x=>x.name===p.name)?.eligibilityReasons||[]).join(', '):''}</p><button type="button" onClick={()=>navigator.clipboard.writeText(p.message)}>Copiar mensagem</button></article>)}</section>}<div className="prospectList">{rows.map((r,i)=><article key={r.id} className={selected.includes(r.id)?'selected':''} onClick={()=>toggle(r.id)}><div className="selectBox">{selected.includes(r.id)&&<Check/>}</div><div className="rank">#{i+1}</div><div className="prospectInfo"><strong>{r.name}</strong><span>{r.address}</span><small>{r.rating?'★ '+r.rating:'Sem nota'} · {r.reviews} avaliações</small></div><div className="scoreBox"><span>Score MeuLocal</span><strong>{r.score}<small>/100</small></strong><em>{r.priority.replace('_',' ')}</em></div></article>)}</div></>}
     </>}

     {view==='leads'&&data&&<section className="adminPanel tablePanel"><div className="panelHead"><div><span>FUNIL COMERCIAL</span><h2>Leads</h2></div><b>{data.leads.length}</b></div><div className="adminTable"><div className="tableRow tableHead"><span>Empresa / contato</span><span>Etapa</span><span>Automação</span><span>Próxima ação</span></div>{data.leads.map((l:any)=><div className="tableRow" key={l.id}><span><strong>{l.business?.name||l.name||'Sem empresa'}</strong><small>{l.email||l.whatsapp||'Sem contato'}</small></span><span><Pill value={l.lifecycle_stage}/></span><span>{l.automation_track||'—'}</span><span>{fmtDate(l.next_action_at)}</span></div>)}</div>{!data.leads.length&&<p className="empty">Nenhum lead ainda.</p>}</section>}

     {view==='diagnostics'&&data&&<><section className="adminPanel repliesPanel"><div className="panelHead"><div><span>CAIXA DE ENTRADA</span><h2>Respostas recebidas</h2></div><b>{filteredDiagnostics.filter((d:any)=>d.reply).length}</b></div>{filteredDiagnostics.filter((d:any)=>d.reply).length?filteredDiagnostics.filter((d:any)=>d.reply).map((d:any)=><article className="replyCard" key={d.id}><div><strong>{d.business_name}</strong><small><Pill value="conversation"/> · {d.reply.channel==='whatsapp'?'WhatsApp':'E-mail'} · {fmtDate(d.reply.at)}</small><p>{d.reply.preview||'Resposta recebida. O conteúdo ainda não foi disponibilizado pelo canal.'}</p></div>{replyingTo===d.id?<div className="replyComposer"><textarea value={replyText} onChange={e=>setReplyText(e.target.value)} placeholder="Escreva a resposta..."/><div><button className="textBtn" onClick={()=>{setReplyingTo(null);setReplyText('')}}>Cancelar</button><button className="replySend" disabled={busy||!replyText.trim()} onClick={()=>sendReply(d)}><Send/>Enviar</button></div></div>:<button className="textBtn" disabled={!d.leadId} onClick={()=>{setReplyingTo(d.id);setReplyText('')}}>Responder</button>}</article>):<p className="empty">Nenhuma resposta ainda. Assim que alguém responder, ela aparecerá aqui.</p>}</section><section className="adminPanel tablePanel"><div className="panelHead"><div><span>DIAGNÓSTICOS</span><h2>Histórico de oportunidades</h2></div><div className="diagnosticActions"><select aria-label="Período dos diagnósticos" value={deliveryPeriod} onChange={e=>setDeliveryPeriod(e.target.value as 'all'|'week'|'month')}><option value="all">Todos (até hoje)</option><option value="week">Últimos 7 dias</option><option value="month">Últimos 30 dias</option></select><button className="textBtn" type="button" disabled={busy||!data.diagnostics.some((d:any)=>d.status==='approved')} onClick={()=>dispatchApproved(data.diagnostics.filter((d:any)=>d.status==='approved'))}>Disparar aprovados</button></div></div>{diagMsg&&<div className="adminMessage">{diagMsg}</div>}<div className="adminTable"><div className="tableRow tableHead diagCols"><span>Empresa</span><span>Score</span><span>Envio</span><span>Etapa da régua</span><span>Contato em</span><span>Abertura confirmada</span><span>CTA</span></div>{filteredDiagnostics.map((d:any)=><div className="tableRow diagCols" key={d.id}><span><strong>{d.business_name}</strong><small>{d.niche||d.region||'—'}</small>{d.delivery?.reason&&<small className="deliveryReason">{d.delivery.reason}</small>}{d.status==='approved'&&<button className="textBtn acquisitionBtn" type="button" disabled={busy} onClick={()=>dispatchApproved([d])}>Tentar novamente</button>}</span><span><b>{d.score}/100</b></span><span><DeliveryPill delivery={d.delivery}/></span><span><Pill value={d.cadence}/></span><span>{fmtDate(d.delivery?.at||d.first_contact_at)}</span><span>{fmtDate(d.diagnostic_opened_at)}</span><span>{fmtDate(d.cta_clicked_at)}</span></div>)}</div>{!filteredDiagnostics.length&&<p className="empty">Nenhum diagnóstico neste período.</p>}</section></>}

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
