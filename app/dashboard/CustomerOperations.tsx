'use client';
import {useEffect,useState} from 'react';
import {createClient} from '@supabase/supabase-js';
import {Activity,CheckCircle2,CircleDollarSign,MessageSquareText,RefreshCw,Settings2,Upload,Workflow} from 'lucide-react';
import CustomerBaseSetup from '../onboarding/CustomerBaseSetup';

const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type Data={
  user:{email?:string|null};
  account:any;business:any;google:any;ghl:any;leads:any[];automations:any[];requests:any[];payments:any[];reviewAutomation:any;
  summary:{sent:number;replies:number;failures:number;activeAutomations:number};
};

function date(v?:string|null){if(!v)return '—';return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(v))}
function money(cents?:number|null,currency='BRL'){if(cents==null)return '—';return new Intl.NumberFormat('pt-BR',{style:'currency',currency}).format(cents/100)}
function label(v?:string|null){const m:Record<string,string>={active:'Ativo',pending:'Pendente',in_progress:'Em andamento',completed:'Concluído',paid:'Pago',past_due:'Em atraso',canceled:'Cancelado',failed:'Falhou',sent:'Enviado',delivered:'Entregue',replied:'Respondido',queued:'Na fila',connected:'Conectado',error:'Erro',provisioning:'Provisionando'};return m[v||'']||String(v||'—').replaceAll('_',' ')}

export default function CustomerOperations(){
  const[data,setData]=useState<Data|null>(null);const[loading,setLoading]=useState(true);const[error,setError]=useState('');const[showImporter,setShowImporter]=useState(false);
  async function load(){
    setLoading(true);setError('');
    if(!url||!key){setError('Integração do painel não configurada.');setLoading(false);return}
    const sb=createClient(url,key);const session=(await sb.auth.getSession()).data.session;
    if(!session){window.location.href='/login';return}
    const r=await fetch('/api/customer-dashboard',{headers:{Authorization:'Bearer '+session.access_token},cache:'no-store'});
    const j=await r.json().catch(()=>({}));if(!r.ok){setError(j.error||'Não foi possível carregar os dados operacionais.');setLoading(false);return}
    setData(j);setLoading(false);
  }
  useEffect(()=>{load()},[]);
  if(loading)return <section className="dashboardPanel operationsPanel"><div className="panelTitle"><div><span>OPERAÇÃO</span><h2>Carregando suas ações...</h2></div><RefreshCw size={20}/></div></section>;
  if(error)return <section className="dashboardPanel operationsPanel"><div className="panelTitle"><div><span>OPERAÇÃO</span><h2>Não foi possível carregar agora.</h2></div></div><p className="panelCopy">{error}</p><button className="linkButton" onClick={load}>Tentar novamente</button></section>;
  if(!data)return null;
  const lastPayment=data.payments?.[0];const base=data.reviewAutomation?.contacts||{total:0,eligible:0,queued:0,active:0,completed:0,optedOut:0};const reviewSettings=data.reviewAutomation?.settings;
  return <>
    <section className="dashboardPanel operationsPanel" id="base-clientes">
      <div className="panelTitle"><div><span>BASE DE CLIENTES</span><h2>Seu flywheel de avaliações</h2></div><Upload size={20}/></div>
      {base.total>0&&!showImporter?<div className="baseDashboardSummary">
        <div className="baseNumbers"><article><span>Na base</span><strong>{base.total}</strong></article><article><span>Na fila</span><strong>{base.queued}</strong></article><article><span>Em andamento</span><strong>{base.active}</strong></article><article><span>Concluídos</span><strong>{base.completed}</strong></article></div>
        <div className="protectionNote"><Workflow/><div><strong>{reviewSettings?.status==='active'?'Ativação protegida ativa':'Base pronta'}</strong><span>{reviewSettings?.status==='active'?'30 clientes no primeiro dia, 40 no segundo e até 50 por dia útil a partir do terceiro. No máximo 3 tentativas por contato.':'Ative a automação para iniciar a distribuição progressiva.'}</span></div></div>
        <button className="linkButton" type="button" onClick={()=>setShowImporter(true)}>Adicionar nova base</button>
      </div>:<CustomerBaseSetup onReady={async()=>{setShowImporter(false);await load()}}/>}
    </section>

    <section className="dashboardPanel operationsPanel" id="operacao">
      <div className="panelTitle"><div><span>MEULOCAL TRABALHANDO</span><h2>Solicitações e automações</h2></div><Workflow size={20}/></div>
      <div className="operationsKpis">
        <article><MessageSquareText/><span>Solicitações enviadas</span><strong>{data.summary.sent}</strong></article>
        <article><CheckCircle2/><span>Respostas recebidas</span><strong>{data.summary.replies}</strong></article>
        <article><Workflow/><span>Automações ativas</span><strong>{data.summary.activeAutomations}</strong></article>
        <article><Activity/><span>Falhas recentes</span><strong>{data.summary.failures}</strong></article>
      </div>
      <div className="operationsSplit">
        <div><div className="miniTitle"><h3>Automações</h3><span>{data.summary.activeAutomations} ativa(s)</span></div>
          <div className="customerList">
            {reviewSettings&&<div><span><strong>Automação de avaliações</strong><small>{base.queued} na fila · até {reviewSettings.steady_limit||50} clientes/dia útil</small></span><b className={'customerStatus '+reviewSettings.status}>{label(reviewSettings.status)}</b><time>{reviewSettings.activated_at?date(reviewSettings.activated_at):'—'}</time></div>}
            {data.automations.slice(0,7).map((a:any)=><div key={a.id}><span><strong>{a.track}</strong><small>Etapa {a.step??0}</small></span><b className={'customerStatus '+a.status}>{label(a.status)}</b><time>{date(a.next_run_at||a.completed_at)}</time></div>)}
            {!reviewSettings&&!data.automations.length&&<p className="panelCopy">Nenhuma automação registrada ainda.</p>}
          </div>
        </div>
        <div><div className="miniTitle"><h3>Últimas ações</h3><span>{data.requests.length} eventos</span></div>
          <div className="customerList">{data.requests.length?data.requests.slice(0,8).map((r:any)=><div key={r.id}><span><strong>{label(r.event_type)} · {r.channel}</strong><small>{r.lead?.email||r.lead?.whatsapp||'Contato'}</small></span><b className={'customerStatus '+r.event_type}>{label(r.event_type)}</b><time>{date(r.created_at)}</time></div>):<p className="panelCopy">As ações aparecerão aqui quando a régua começar a rodar.</p>}</div>
        </div>
      </div>
    </section>

    <div className="dashboardColumns">
      <section className="dashboardPanel">
        <div className="panelTitle"><div><span>ASSINATURA</span><h2>Plano e cobrança</h2></div><CircleDollarSign size={20}/></div>
        <div className="accountFacts">
          <div><span>Status</span><strong>{label(data.account?.payment_status)}</strong></div>
          <div><span>Provedor</span><strong>{data.account?.payment_provider||lastPayment?.provider||'Asaas'}</strong></div>
          <div><span>Último pagamento</span><strong>{date(data.account?.paid_at||lastPayment?.paid_at)}</strong></div>
          <div><span>Valor</span><strong>{money(lastPayment?.amount_cents,lastPayment?.currency||'BRL')}</strong></div>
        </div>
        {lastPayment&&<p className="panelCopy">Cobrança {label(lastPayment.status)} · {lastPayment.cycle||'recorrente'}.</p>}
      </section>
      <section className="dashboardPanel">
        <div className="panelTitle"><div><span>CONTA</span><h2>Configuração da plataforma</h2></div><Settings2 size={20}/></div>
        <div className="accountFacts">
          <div><span>Empresa</span><strong>{data.business?.name||'—'}</strong></div>
          <div><span>Seu acesso</span><strong>{data.user?.email||'—'}</strong></div>
          <div><span>Google</span><strong>{data.google?label(data.google.status):'Não conectado'}</strong></div>
          <div><span>Automação</span><strong>{reviewSettings?label(reviewSettings.status):'Aguardando ativação'}</strong></div>
        </div>
        <p className="panelCopy">{data.google?.last_sync_at?'Última sincronização com Google: '+date(data.google.last_sync_at):'Conecte o Google para manter seus dados atualizados.'}</p>
      </section>
    </div>
  </>;
}