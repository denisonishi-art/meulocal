'use client';

import { useState } from 'react';
import { ArrowRight, LockKeyhole, MapPin } from 'lucide-react';

export default function LoginPage(){
  const [mode,setMode]=useState<'login'|'create'>('login');
  return <main className="loginPage">
    <header className="nav container"><a className="brand" href="/"><span className="brandMark"><MapPin size={19}/></span>MeuLocal</a></header>
    <section className="loginWrap container">
      <div className="loginCard">
        <div className="loginIcon"><LockKeyhole size={23}/></div>
        <span className="stepLabel">ÁREA DO CLIENTE</span>
        <h1>{mode==='login'?'Acesse seu MeuLocal':'Crie seu acesso'}</h1>
        <p>{mode==='login'?'Acompanhe a evolução da reputação do seu negócio.':'Seu pagamento foi confirmado. Crie seu acesso para acompanhar seus resultados.'}</p>
        <form onSubmit={(e)=>e.preventDefault()}>
          <label>E-mail<input type="email" placeholder="voce@empresa.com.br" required/></label>
          <label>Senha<input type="password" placeholder="••••••••" minLength={8} required/></label>
          {mode==='create'&&<label>Confirmar senha<input type="password" placeholder="••••••••" minLength={8} required/></label>}
          <a className="primary loginSubmit" href={mode==='create'?'/onboarding':'/dashboard'}>{mode==='create'?'Criar meu acesso':'Entrar'} <ArrowRight size={18}/></a>
        </form>
        <button className="linkButton loginSwitch" type="button" onClick={()=>setMode(mode==='login'?'create':'login')}>{mode==='login'?'Primeiro acesso? Criar senha':'Já tenho acesso'}</button>
      </div>
      <small>Seu acesso é exclusivo ao ambiente MeuLocal.</small>
    </section>
  </main>;
}
