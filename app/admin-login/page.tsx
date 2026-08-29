'use client';
import {FormEvent,useState} from 'react';
import {LockKeyhole,MapPin} from 'lucide-react';
import '../admin/admin.css';

export default function AdminLogin(){const[key,setKey]=useState('');const[error,setError]=useState('');const[busy,setBusy]=useState(false);
async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');const r=await fetch('/api/admin/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})});setBusy(false);if(!r.ok){setError('Acesso inválido.');return}const next=new URLSearchParams(location.search).get('next')||'/admin';location.href=next}
return <main className="adminLoginPage"><div className="adminLoginCard"><div className="adminBrand dark"><span><MapPin size={18}/></span>MeuLocal <b>Admin</b></div><div className="adminLoginIcon"><LockKeyhole/></div><span>ACESSO RESTRITO</span><h1>Centro de comando</h1><p>Entre para gerenciar prospecção, agentes e aprendizado.</p><form onSubmit={submit}><label>Chave de acesso<input type="password" value={key} onChange={e=>setKey(e.target.value)} autoFocus required/></label>{error&&<div className="adminLoginError">{error}</div>}<button disabled={busy}>{busy?'Validando...':'Entrar no Admin'}</button></form></div></main>}
