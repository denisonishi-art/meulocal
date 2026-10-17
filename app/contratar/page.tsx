'use client';

import {FormEvent,useEffect,useState} from 'react';
import {getPaymentPlan,PaymentPlanId} from '@/lib/payments/plans';
import { ArrowLeft, ArrowRight, Check, MapPin, Star, TrendingUp } from 'lucide-react';

type CheckoutContext={businessId:string|null;leadId:string|null;name:string;email:string;phone:string;businessName?:string};

export default function ContratarPage(){
  const [planId,setPlanId]=useState<PaymentPlanId>('essencial');
  const [planValid,setPlanValid]=useState(true);
  const [availablePlans,setAvailablePlans]=useState<string[]>([]);
  const [availabilityError,setAvailabilityError]=useState(false);
  const plan=getPaymentPlan(planId)!;
  const checkoutEnabled=planValid&&availablePlans.includes(planId);
  const [name,setName]=useState('');
  const [email,setEmail]=useState('');
  const [phone,setPhone]=useState('');
  const [businessId,setBusinessId]=useState<string|null>(null);
  const [leadId,setLeadId]=useState<string|null>(null);
  const [businessName,setBusinessName]=useState('');
  const [city,setCity]=useState('');
  const [loading,setLoading]=useState(false);
  const [ready,setReady]=useState(false);
  const [error,setError]=useState('');
  const [paymentState,setPaymentState]=useState<string|null>(null);

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);setPaymentState(params.get('payment'));
    const chosen=params.get('plan');if(chosen){const selected=getPaymentPlan(chosen);if(selected)setPlanId(selected.id);else setPlanValid(false)}
    let disposed=false;
    fetch('/api/payments/plans',{cache:'no-store'}).then(async r=>{if(!r.ok)throw Error();const data=await r.json();if(!Array.isArray(data.plans))throw Error();if(!disposed)setAvailablePlans(data.plans.filter((p:any)=>p.checkoutEnabled===true).map((p:any)=>p.id))}).catch(()=>{if(!disposed)setAvailabilityError(true)});
    try{
      const raw=sessionStorage.getItem('meulocal_checkout_context');
      if(raw){const c=JSON.parse(raw) as CheckoutContext;setName(c.name||'');setEmail(c.email||'');setPhone(c.phone||'');setBusinessId(c.businessId||null);setLeadId(c.leadId||null);setBusinessName(c.businessName||'');}
    }catch{}
    setReady(true);
    return ()=>{disposed=true};
  },[]);

  async function startCheckout(e:FormEvent){
    e.preventDefault(); setError('');
    if(!checkoutEnabled){setError('A contratação deste plano ainda não está liberada.');return}
    if((!businessId||!leadId)&&(!businessName.trim()||!city.trim())){setError('Informe sua empresa e cidade para contratar.');return}
    setLoading(true);
    try{
      let resolvedBusinessId=businessId,resolvedLeadId=leadId;
      if(!resolvedBusinessId||!resolvedLeadId){
        const prep=await fetch('/api/payments/prepare-direct',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({businessName,city,name,email,phone,planId})});
        const prepared=await prep.json();if(!prep.ok)throw new Error(prepared.error||'Não foi possível identificar sua empresa.');
        resolvedBusinessId=prepared.businessId;resolvedLeadId=prepared.leadId;
      }
      const res=await fetch('/api/payments/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,email,phone,businessId:resolvedBusinessId,leadId:resolvedLeadId,planId})});
      const data=await res.json();
      if(!res.ok)throw new Error(data.error||'Não foi possível iniciar o pagamento.');
      window.location.href=data.checkoutUrl;
    }catch(err:any){setError(err?.message||'Não foi possível iniciar o pagamento.')}finally{setLoading(false)}
  }

  if(!ready)return <main className="checkoutPage"><section className="checkoutHero container"><p>Carregando ativação...</p></section></main>;
  return <main className="checkoutPage">
    <header className="nav container">
      <a className="brand" href="/"><span className="brandMark"><MapPin size={19}/></span>MeuLocal</a>
      <a className="navCta" href="/diagnostico"><ArrowLeft size={16}/> Voltar</a>
    </header>

    <section className="checkoutHero container">
      <div className="eyebrow"><span></span>Ativação simples</div>
      <h1>Fortaleça sua reputação.<br/>Apareça mais. Venda mais.</h1>
      <p>{businessName?<>Você está ativando o MeuLocal para <strong>{businessName}</strong>.</>:<>Ative o MeuLocal e comece a transformar sua presença no Google em mais confiança e mais oportunidades de venda.</>}</p>
      {paymentState==='processing'&&<div className="loginSuccess">Pagamento enviado. A ativação será liberada somente após a confirmação do Asaas.</div>}
      {paymentState==='canceled'&&<div className="loginError">Pagamento cancelado. Você pode tentar novamente quando quiser.</div>}
      {paymentState==='expired'&&<div className="loginError">Este checkout expirou. Confira a solicitação existente antes de tentar novamente.</div>}

      <div className="checkoutCard">
        <div className="checkoutBenefits">
          <article><div className="benefitIcon"><Star size={22}/></div><div><strong>Mais avaliações para construir uma reputação que gera mais vendas</strong><p>Crie consistência na sua reputação sem depender de pedidos manuais.</p></div></article>
          <article><div className="benefitIcon"><TrendingUp size={22}/></div><div><strong>Mais visibilidade para ser encontrado e escolhido</strong><p>Fortaleça sua presença no Google e acompanhe onde agir primeiro.</p></div></article>
        </div>

        <form className="checkoutAction" onSubmit={startCheckout}>
          <label>Plano<select style={{width:'100%',padding:12,borderRadius:8,border:'1px solid #dce3db',background:'#fff'}} value={planId} onChange={e=>{setPlanId(e.target.value as PaymentPlanId);setPlanValid(true);setError('')}} disabled={loading}>
            <option value="essencial">Essencial</option><option value="inteligencia">Inteligência</option>
          </select></label>
          <span>MeuLocal {plan.name}</span>
          <h2>{(plan.amountCents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}/mês</h2>
          <p>{planId==='essencial'?'Automatize os pedidos de avaliação e acompanhe sua reputação.':'Tudo do Essencial, mais análise de temas e resumo semanal com prioridades. Camada de inteligência em desenvolvimento.'}</p>
          {!planValid&&<div className="loginError" role="alert">O plano informado não é válido. Escolha um dos planos abaixo.</div>}
          {!checkoutEnabled&&<p role="status">{availabilityError?'Não foi possível conferir a disponibilidade. Tente novamente mais tarde.':'Plano em preparação. Contratação ainda não liberada.'}</p>}
          <p>Sem reunião. Sem complicação. Cancele quando quiser.</p>
          <label>Nome<input value={name} onChange={e=>setName(e.target.value)} required autoComplete="name"/></label>
          <label>E-mail<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email" readOnly={Boolean(leadId)}/></label>
          <label>WhatsApp<input value={phone} onChange={e=>setPhone(e.target.value)} autoComplete="tel" placeholder="(11) 99999-9999"/></label>
          {(!businessId||!leadId)&&<><label>Nome da empresa<input value={businessName} onChange={e=>setBusinessName(e.target.value)} required minLength={2} maxLength={200}/></label><label>Cidade / UF<input value={city} onChange={e=>setCity(e.target.value)} required minLength={2} maxLength={120} placeholder="São Paulo / SP"/></label></>}
          {error&&<small role="alert">{error}</small>}
          <button className="primary checkoutButton" type="submit" disabled={loading||!checkoutEnabled}>{loading?'Abrindo pagamento...':!checkoutEnabled?'Contratação em preparação':<>Assinar {plan.name} <ArrowRight size={18}/></>}</button>
          <small>Pagamento seguro processado pelo Asaas. A ativação ocorre após confirmação do pagamento. Não é necessário fazer diagnóstico.</small>
        </form>
      </div>

      <div className="checkoutTrust"><span><Check size={15}/> Ativação online</span><span><Check size={15}/> Sem reunião obrigatória</span><span><Check size={15}/> Acompanhamento contínuo</span></div>
    </section>
  </main>;
}
