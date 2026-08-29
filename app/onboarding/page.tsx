'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, Check, FileSpreadsheet, MapPin, MessageCircle, Store } from 'lucide-react';
import {createClient} from '@supabase/supabase-js';

const steps = [
  { title: 'Confirmar seu negócio', text: 'Usamos os dados do diagnóstico para evitar perguntas repetidas.', icon: Store },
  { title: 'Conectar seu Google', text: 'Autorize o MeuLocal a acompanhar avaliações e evolução da sua reputação.', icon: MessageCircle },
  { title: 'Trazer seus clientes', text: 'Envie uma planilha CSV ou Excel agora, ou pule e faça isso depois.', icon: FileSpreadsheet },
];
type Location={id:string;accountId:string;title:string;address:string};
const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;const supabaseKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default function OnboardingPage() {
  const [step, setStep] = useState(0);const [skipped, setSkipped] = useState(false);const [googleBusy,setGoogleBusy]=useState(false);const [googleConnected,setGoogleConnected]=useState(false);const [locations,setLocations]=useState<Location[]>([]);const [selected,setSelected]=useState('');const [googleError,setGoogleError]=useState('');
  async function session(){if(!supabaseUrl||!supabaseKey)return null;const sb=createClient(supabaseUrl,supabaseKey);const {data}=await sb.auth.getSession();return data.session}
  async function connectGoogle(){setGoogleError('');setGoogleBusy(true);const s=await session();if(!s){window.location.href='/login';return}const res=await fetch('/api/google-business/connect',{headers:{Authorization:`Bearer ${s.access_token}`}});const data=await res.json();setGoogleBusy(false);if(!res.ok){setGoogleError(data.error||'Não foi possível conectar o Google.');return}window.location.href=data.url}
  async function loadLocations(){setGoogleBusy(true);const s=await session();if(!s){setGoogleBusy(false);return}const res=await fetch('/api/google-business/locations',{headers:{Authorization:`Bearer ${s.access_token}`}});const data=await res.json();setGoogleBusy(false);if(!res.ok){setGoogleError(data.error||'Não foi possível carregar suas unidades.');return}setLocations(data.locations||[]);if((data.locations||[]).length===1)await chooseLocation(data.locations[0])}
  async function chooseLocation(location:Location){setGoogleBusy(true);setGoogleError('');const s=await session();if(!s)return;const res=await fetch('/api/google-business/select',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${s.access_token}`},body:JSON.stringify({accountId:location.accountId,locationId:location.id,title:location.title})});if(!res.ok){const data=await res.json();setGoogleError(data.error||'Não foi possível selecionar a unidade.');setGoogleBusy(false);return}setSelected(location.id);setGoogleConnected(true);await fetch('/api/google-business/sync',{method:'POST',headers:{Authorization:`Bearer ${s.access_token}`}});setGoogleBusy(false)}
  useEffect(()=>{const p=new URLSearchParams(window.location.search);if(p.get('google')==='connected'){setStep(1);loadLocations()}else if(p.get('google')){setStep(1);setGoogleError('A conexão com o Google não foi concluída. Tente novamente.')}},[]);

  return <main className="onboardingPage">
    <header className="nav container"><a className="brand" href="/"><span className="brandMark"><MapPin size={19}/></span>MeuLocal</a><span className="onboardingStatus">Configuração {Math.min(step + 1, 3)}/3</span></header>
    <section className="onboardingHero container">
      <div className="successPill"><Check size={16}/> Seu MeuLocal está ativo</div>
      <h1>Agora vamos colocar o MeuLocal para trabalhar.</h1><p>Leva poucos minutos. Você continua no nosso ambiente do começo ao fim.</p>
      <div className="onboardingCard">
        {step < 3 ? <>
          <div className="stepProgress"><i style={{width: `${((step + 1) / 3) * 100}%`}} /></div>
          <div className="stepIcon">{(() => { const Icon = steps[step].icon; return <Icon size={24}/>; })()}</div><span className="stepLabel">Etapa {step + 1}</span><h2>{steps[step].title}</h2><p>{steps[step].text}</p>
          {step === 0 && <div className="onboardingSummary"><strong>Não vamos pedir de novo o que já sabemos.</strong><span>Nome, endereço e perfil do Google serão reaproveitados do diagnóstico.</span></div>}
          {step === 1 && <div className="connectionList">
            {!googleConnected&&locations.length===0&&<button type="button" onClick={connectGoogle} disabled={googleBusy}><span>Google Business Profile</span><b>{googleBusy?'Aguarde...':'Conectar'}</b></button>}
            {locations.length>1&&!googleConnected&&<div className="locationPicker"><strong>Qual unidade você quer acompanhar?</strong>{locations.map(l=><button key={l.id} type="button" className={selected===l.id?'selected':''} onClick={()=>chooseLocation(l)} disabled={googleBusy}><span>{l.title}<small>{l.address}</small></span><b>Usar esta</b></button>)}</div>}
            {googleConnected&&<div className="onboardingSummary"><strong>Google conectado ✓</strong><span>Já fizemos a primeira sincronização da sua reputação.</span></div>}
            {googleError&&<div className="loginError">{googleError}</div>}
          </div>}
          {step === 2 && <div className="uploadBox"><FileSpreadsheet size={27}/><strong>Arraste seu CSV/Excel aqui</strong><span>Ou escolha um arquivo do seu computador.</span><button type="button">Escolher arquivo</button></div>}
          <div className="onboardingActions"><button className="primary" type="button" onClick={() => setStep(step + 1)} disabled={step===1&&!googleConnected}>{step === 2 ? 'Ativar operação' : 'Continuar'} <ArrowRight size={18}/></button>{step === 2 && <button className="linkButton" type="button" onClick={() => {setSkipped(true); setStep(3);}}>Fazer isso depois</button>}</div>
        </> : <div className="onboardingDone"><div className="stepIcon"><Check size={27}/></div><h2>Configuração concluída.</h2><p>{skipped ? 'Você pode enviar sua base quando quiser. Seu painel já está disponível.' : 'Sua operação está pronta. Agora acompanhe a evolução da sua reputação.'}</p><a className="primary" href="/dashboard">Ver meu dashboard <ArrowRight size={18}/></a></div>}
      </div>
      <div className="privacyNote">Toda a experiência acontece dentro do MeuLocal.</div>
    </section>
  </main>;
}
