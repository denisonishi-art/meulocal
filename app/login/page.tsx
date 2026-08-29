'use client';
import '../dashboard/dashboard.css';
import {FormEvent,useState} from 'react';
import {ArrowRight,LockKeyhole,MapPin} from 'lucide-react';
import {createClient} from '@supabase/supabase-js';

const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type Mode='login'|'create'|'forgot';

export default function LoginPage(){
 const[mode,setMode]=useState<Mode>('login'); const[email,setEmail]=useState(''); const[password,setPassword]=useState(''); const[confirm,setConfirm]=useState(''); const[error,setError]=useState(''); const[message,setMessage]=useState(''); const[loading,setLoading]=useState(false);
 async function submit(e:FormEvent){e.preventDefault();setError('');setMessage('');if(!url||!key){setError('A área do cliente ainda está sendo ativada. Tente novamente em instantes.');return}setLoading(true);const supabase=createClient(url,key);
  if(mode==='forgot'){
    const {error:resetError}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:`${window.location.origin}/login?reset=1`});setLoading(false);
    if(resetError){setError('Não foi possível enviar o link agora. Tente novamente.');return}
    setMessage('Enviamos um link para redefinir sua senha. Confira seu e-mail.');return;
  }
  if(mode==='create'&&password!==confirm){setLoading(false);setError('As senhas precisam ser iguais.');return}
  const result=mode==='create'?await supabase.auth.signUp({email,password}):await supabase.auth.signInWithPassword({email,password});setLoading(false);if(result.error){setError(mode==='login'?'E-mail ou senha inválidos.':'Não foi possível criar seu acesso. Verifique os dados e tente novamente.');return}window.location.href=mode==='create'?'/onboarding':'/dashboard';}
 const title=mode==='login'?'Acesse seu MeuLocal':mode==='create'?'Crie seu acesso':'Recupere sua senha';
 const copy=mode==='login'?'Veja seu Score, avaliações e evolução em poucos segundos.':mode==='create'?'Crie sua senha para acompanhar os resultados do seu negócio.':'Informe seu e-mail e enviaremos um link para criar uma nova senha.';
 return <main className="loginPage"><header className="nav container"><a className="brand" href="/"><span className="brandMark"><MapPin size={19}/></span>MeuLocal</a></header><section className="loginWrap container"><div className="loginCard"><div className="loginIcon"><LockKeyhole size={23}/></div><span className="stepLabel">ÁREA DO CLIENTE</span><h1>{title}</h1><p>{copy}</p><form onSubmit={submit}><label>E-mail<input type="email" inputMode="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="voce@empresa.com.br" required/></label>{mode!=='forgot'&&<><label>Senha<input type="password" autoComplete={mode==='login'?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" minLength={8} required/></label>{mode==='create'&&<label>Confirmar senha<input type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="••••••••" minLength={8} required/></label>}</>}{error&&<div className="loginError" role="alert">{error}</div>}{message&&<div className="loginSuccess" role="status">{message}</div>}<button className="primary loginSubmit" type="submit" disabled={loading}>{loading?'Aguarde...':mode==='create'?'Criar meu acesso':mode==='forgot'?'Enviar link':'Entrar'} {!loading&&<ArrowRight size={18}/>}</button></form>{mode==='login'&&<button className="linkButton loginSwitch" type="button" onClick={()=>{setError('');setMessage('');setMode('forgot')}}>Esqueci minha senha</button>}<button className="linkButton loginSwitch" type="button" onClick={()=>{setError('');setMessage('');setMode(mode==='create'?'login':mode==='forgot'?'login':'create')}}>{mode==='login'?'Primeiro acesso? Criar senha':'Voltar para entrar'}</button></div><small>Seu acesso é exclusivo ao ambiente MeuLocal.</small></section></main>}
