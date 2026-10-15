'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, Check, FileSpreadsheet, MapPin, MessageCircle, Store } from 'lucide-react';
import {createClient} from '@supabase/supabase-js';
import CustomerBaseSetup from './CustomerBaseSetup';

const steps = [
  { title: 'Confirmar seu negócio', text: 'Usamos os dados do diagnóstico para evitar perguntas repetidas.', icon: Store },
  { title: 'Conectar seu Google', text: 'Conecte para sincronizar suas avaliações ou continue e faça isso depois.', icon: MessageCircle },
  { title: 'Trazer seus clientes', text: 'Envie uma planilha CSV ou Excel depois. Esta etapa é opcional para começar.', icon: FileSpreadsheet },
];
type Location={id:string;accountId:string;title:string;address:string;placeId?:string|null;mapsUri?:string|null;newReviewUri?:string|null};
const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;const supabaseKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default function OnboardingPage() {
  const [step, setStep] = useState(0);const [skipped, setSkipped] = useState(false);const [baseReady,setBaseReady]=useState(false);const [googleBusy,setGoogleBusy]=useState(false);const [googleConnected,setGoogleConnected]=useState(false);const [locations,setLocations]=useState<Location[]>([]);const [selected,setSelected]=useState('');const [googleError,setGoogleError]=useState('');const [checking,setChecking]=useState(true);const [paymentBlocked,setPaymentBlocked]=useState(false);
  const [accessError,setAccessError]=useState('');
  const [progressError,setProgressError]=useState('');
  async function session(){if(!supabaseUrl||!supabaseKey)return null;const sb=createClient(supabaseUrl,supabaseKey);const {data}=await sb.auth.getSession();return data.session}
  async function setStatus(status:'pending'|'in_progress'|'completed') {
    setProgressError('');
    try {
      const s=await session();
      if(!s){setProgressError('Sua sessão expirou. Entre novamente para salvar.');return false}
      const res=await fetch('/api/onboarding/status',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${s.access_token}`},body:JSON.stringify({status})});
      if(!res.ok){
        const data=await res.json().catch(()=>({}));
        setProgressError(typeof data.error==='string'?data.error:'Não foi possível salvar sua configuração. Tente novamente.');
        return false;
      }
      return true;
    } catch {
      setProgressError('Não foi possível salvar sua configuração. Confira sua conexão e tente novamente.');
      return false;
    }
  }
  async function connectGoogle(){setGoogleError('');setGoogleBusy(true);const s=await session();if(!s){setGoogleBusy(false);window.location.href='/login';return}const res=await fetch('/api/google-business/connect',{headers:{Authorization:`Bearer ${s.access_token}`}});const data=await res.json();setGoogleBusy(false);if(!res.ok){setGoogleError(data.error||'Não foi possível conectar o Google.');return}window.location.href=data.url}
  async function loadLocations(){setGoogleBusy(true);const s=await session();if(!s){setGoogleBusy(false);return}const res=await fetch('/api/google-business/locations',{headers:{Authorization:`Bearer ${s.access_token}`}});const data=await res.json();setGoogleBusy(false);if(!res.ok){setGoogleError(data.error||'Não foi possível carregar suas unidades.');return}setLocations(data.locations||[]);if((data.locations||[]).length===1)await chooseLocation(data.locations[0])}
  async function chooseLocation(location:Location){setGoogleBusy(true);setGoogleError('');const s=await session();if(!s){setGoogleBusy(false);return}const res=await fetch('/api/google-business/select',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${s.access_token}`},body:JSON.stringify({accountId:location.accountId,locationId:location.id,title:location.title,placeId:location.placeId||null,mapsUri:location.mapsUri||null,newReviewUri:location.newReviewUri||null})});if(!res.ok){const data=await res.json();setGoogleError(data.error||'Não foi possível selecionar a unidade.');setGoogleBusy(false);return}const sync=await fetch('/api/google-business/sync',{method:'POST',headers:{Authorization:`Bearer ${s.access_token}`}});if(!sync.ok){const data=await sync.json().catch(()=>({}));setGoogleError(data.error||'Google conectado, mas a primeira sincronização falhou. Tente novamente.');setGoogleBusy(false);return}setSelected(location.id);setGoogleConnected(true);setGoogleBusy(false)}
  async function advance(){
    if(step===0&&!(await setStatus('in_progress')))return;
    if(step===2){if(await setStatus('completed'))setStep(3);return}
    setStep(step+1);
  }
  async function deferStep(){
    if(step===1){setStep(2);return}
    if(await setStatus('completed')){setSkipped(true);setStep(3)}
  }
  useEffect(()=>{
    async function checkAccess(){
      try {
        const s=await session();
        if(!s){window.location.href='/login';return}
        const statusRes=await fetch('/api/onboarding/status',{headers:{Authorization:`Bearer ${s.access_token}`}});
        if(!statusRes.ok)throw new Error('access_lookup_failed');
        const status=await statusRes.json();
        if(status.canStartOnboarding!==true){setPaymentBlocked(true);return}
        if(status.onboarding_status==='completed')setStep(3);
        const p=new URLSearchParams(window.location.search);
        if(p.get('google')==='connected'){setStep(1);await loadLocations()}
        else if(p.get('google')){setStep(1);setGoogleError('A conexão com o Google não foi concluída. Tente novamente.')}
        else if(p.get('setup')==='google')setStep(1);
      } catch {
        setAccessError('Não foi possível verificar seu acesso. Confira sua conexão e tente novamente.');
      } finally {setChecking(false)}
    }
    void checkAccess();
  },[]);

  if(checking)return <main className="onboardingPage"><section className="onboardingHero container"><div className="onboardingCard"><h2>Carregando sua configuração...</h2></div></section></main>;
  if(accessError)return <main className="onboardingPage"><section className="onboardingHero container"><div className="onboardingCard"><h2>Não foi possível verificar seu acesso</h2><p role="alert">{accessError}</p><a className="primary" href="/onboarding">Tentar novamente</a><a className="linkButton" href="/login">Entrar novamente</a></div></section></main>;
  if(paymentBlocked)return <main className="onboardingPage"><header className="nav container"><a className="brand" href="/"><span className="brandMark"><MapPin size={19}/></span>MeuLocal</a></header><section className="onboardingHero container"><div className="onboardingCard"><span className="stepLabel">ATIVAÇÃO PENDENTE</span><h2>Aguardando confirmação do pagamento.</h2><p>Seu onboarding será liberado automaticamente quando o provedor de pagamento confirmar a assinatura.</p><a className="primary" href="/contratar">Voltar para ativação <ArrowRight size={18}/></a></div></section></main>;

  return <main className="onboardingPage">
    <header className="nav container"><a className="brand" href="/"><span className="brandMark"><MapPin size={19}/></span>MeuLocal</a><span className="onboardingStatus">Configuração {Math.min(step + 1, 3)}/3</span></header>
    <section className="onboardingHero container">
      <div className="successPill"><Check size={16}/> Pagamento confirmado</div>
      <h1>Agora vamos colocar o MeuLocal para trabalhar.</h1><p>Leva poucos minutos. Você continua no nosso ambiente do começo ao fim.</p>
      <div className="onboardingCard">
        {step < 3 ? <>
          <div className="stepProgress"><i style={{width: `${((step + 1) / 3) * 100}%`}} /></div>
          <div className="stepIcon">{(() => { const Icon = steps[step].icon; return <Icon size={24}/>; })()}</div><span className="stepLabel">Etapa {step + 1}</span><h2>{steps[step].title}</h2><p>{steps[step].text}</p>
          {step === 0 && <div className="onboardingSummary"><strong>Não vamos pedir de novo o que já sabemos.</strong><span>Nome, endereço e perfil do Google serão reaproveitados do diagnóstico.</span></div>}
          {step === 1 && <div className="connectionList">
            {!googleConnected&&locations.length===0&&<button type="button" onClick={connectGoogle} disabled={googleBusy}><span>Google Business Profile</span><b>{googleBusy?'Aguarde...':'Conectar'}</b></button>}
            {locations.length>1&&!googleConnected&&<div className="locationPicker"><strong>Qual unidade você quer acompanhar?</strong>{locations.map(l=><button key={l.id} type="button" className={selected===l.id?'selected':''} onClick={()=>chooseLocation(l)} disabled={googleBusy}><span>{l.title}<small>{l.address}</small></span><b>Usar esta</b></button>)}</div>}
            {googleConnected&&<div className="onboardingSummary"><strong>Google conectado ✓</strong><span>A primeira sincronização da sua reputação foi concluída.</span></div>}
            {googleError&&<div className="loginError">{googleError}</div>}
          </div>}
          {step === 2 && <CustomerBaseSetup onReady={setBaseReady}/>} 
          {progressError&&<div className="loginError" role="alert">{progressError}</div>}
          <div className="onboardingActions"><button className="primary" type="button" onClick={advance} disabled={(step===1&&!googleConnected)||(step===2&&!baseReady)}>{step === 2 ? 'Concluir configuração' : 'Continuar'} <ArrowRight size={18}/></button>{(step === 1||step === 2) && <button className="linkButton" type="button" onClick={deferStep}>Fazer isso depois</button>}</div>
        </> : <div className="onboardingDone"><div className="stepIcon"><Check size={27}/></div><h2>Configuração concluída.</h2><p>{skipped ? 'Sua configuração inicial foi salva. Você pode enviar sua base depois pelo painel.' : 'Sua configuração inicial foi salva. Seu painel já está disponível.'}</p><p>{googleConnected?'A primeira sincronização do Google foi concluída.':'A conexão com o Google pode ser feita depois. Até lá, novas avaliações não serão sincronizadas.'}</p><a className="primary" href="/dashboard">Ver meu dashboard <ArrowRight size={18}/></a></div>}
      </div>
      <div className="privacyNote">Toda a experiência acontece dentro do MeuLocal.</div>
    </section>
  </main>;
}
