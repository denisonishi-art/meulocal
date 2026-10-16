'use client';
import {useEffect,useState,useRef} from 'react';
import {createClient} from '@supabase/supabase-js';

export default function ReviewMonitorStatus(){
 const generation=useRef(0);
 const [data,setData]=useState<any>(null),[error,setError]=useState('');
 async function load(){
  const current=++generation.current;
  setData(null);setError('');
  try{
   const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
   if(!url||!key)throw Error();
   const session=(await createClient(url,key).auth.getSession()).data.session;
   if(!session)throw Error();
   const r=await fetch('/api/review-monitor',{headers:{Authorization:'Bearer '+session.access_token},cache:'no-store'});
   const j=await r.json();if(!r.ok||!Array.isArray(j.alerts))throw Error();if(current===generation.current)setData(j);
  }catch{if(current===generation.current)setError('Não foi possível conferir o monitoramento. Tente novamente.')}
 }
 useEffect(()=>{const requests=generation;load();return ()=>{requests.current++}},[]);
 const labels:Record<string,string>={pending:'Na fila',preparing:'Preparando',dispatching:'Envio em andamento',accepted:'Aceito pelo provedor — entrega não confirmada',delivered:'Entrega confirmada',uncertain:'Resultado incerto — exige conferência',failed:'Falha de entrega'};
 return <section className="dashboardPanel operationsPanel"><h2>Monitoramento de avaliações</h2>
  <p>Consulta por hora. Alertas em até 3 horas após disponibilização pela API do Google, com Google e canal ativos. Nenhuma resposta é escrita ou publicada.</p>
  {error?<p role="alert">{error}</p>:!data?<p>Consultando...</p>:<>
   <p><strong>{!data.enabled?'Monitoramento ainda não ativado':data.stale?'Monitoramento pendente ou atrasado — confira a conexão Google':'Última consulta concluída'}</strong></p>
   <p>Responsável: {data.recipient} · Última consulta: {data.lastScan?new Date(data.lastScan).toLocaleString('pt-BR'):'Ainda não registrada'}</p>
   {data.alerts.map((a:any)=><article key={a.id}><strong>{a.rating} estrela(s) · {labels[a.state]||a.state}</strong><p>{a.verdict==='uncertain'?'Análise inconclusiva: confira a avaliação.':'Avaliação exige atenção.'} Detectada em {new Date(a.first_seen_at).toLocaleString('pt-BR')}.</p>{!a.delivered_at&&Date.parse(a.deadline_at)<Date.now()&&<p role="alert">Prazo excedido sem confirmação de entrega.</p>}</article>)}
   {!data.alerts.length&&<p>Nenhum alerta registrado. Isso não comprova ausência de reclamações quando o monitoramento está pendente.</p>}
  </>}
  <button className="linkButton" type="button" onClick={load}>Atualizar monitoramento</button>
 </section>;
}
