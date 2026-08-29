'use client';

import { useState } from 'react';
import { ArrowRight, Check, FileSpreadsheet, MapPin, MessageCircle, Store } from 'lucide-react';

const steps = [
  { title: 'Confirmar seu negócio', text: 'Usamos os dados do diagnóstico para evitar perguntas repetidas.', icon: Store },
  { title: 'Conectar seus canais', text: 'Google e WhatsApp ficam conectados ao MeuLocal. A tecnologia por trás permanece invisível.', icon: MessageCircle },
  { title: 'Trazer seus clientes', text: 'Envie uma planilha CSV ou Excel agora, ou pule e faça isso depois.', icon: FileSpreadsheet },
];

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [skipped, setSkipped] = useState(false);

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
          {step === 1 && <div className="connectionList"><button type="button"><span>Google Business Profile</span><b>Conectar</b></button><button type="button"><span>WhatsApp Business</span><b>Conectar</b></button></div>}
          {step === 2 && <div className="uploadBox"><FileSpreadsheet size={27}/><strong>Arraste seu CSV/Excel aqui</strong><span>Ou escolha um arquivo do seu computador.</span><button type="button">Escolher arquivo</button></div>}
          <div className="onboardingActions"><button className="primary" type="button" onClick={() => setStep(step + 1)}>{step === 2 ? 'Ativar operação' : 'Continuar'} <ArrowRight size={18}/></button>{step === 2 && <button className="linkButton" type="button" onClick={() => {setSkipped(true); setStep(3);}}>Fazer isso depois</button>}</div>
        </> : <div className="onboardingDone"><div className="stepIcon"><Check size={27}/></div><h2>Configuração concluída.</h2><p>{skipped ? 'Você pode enviar sua base quando quiser. Seu painel já está disponível.' : 'Sua operação está pronta. Agora acompanhe a evolução da sua reputação.'}</p><a className="primary" href="/dashboard">Ver meu dashboard <ArrowRight size={18}/></a></div>}
      </div>
      <div className="privacyNote">Toda a experiência acontece dentro do MeuLocal.</div>
    </section>
  </main>;
}
