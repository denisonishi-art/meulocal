'use client';

import {FormEvent,useEffect,useState} from 'react';
import styles from './checkout.module.css';
import {getPaymentPlan,PaymentPlanId} from '@/lib/payments/plans';
import { ArrowLeft, ArrowRight, Check, MapPin, Star, TrendingUp } from 'lucide-react';

type CheckoutContext={name?:string;email?:string;phone?:string;businessName?:string};

export default function ContratarPage(){
  const [planId,setPlanId]=useState<PaymentPlanId>('essencial');
  const [planValid,setPlanValid]=useState(true);
  const plan=getPaymentPlan(planId)!;
  const [name,setName]=useState('');
  const [email,setEmail]=useState('');
  const [phone,setPhone]=useState('');
  const [businessName,setBusinessName]=useState('');
  const [loading,setLoading]=useState(false);
  const [ready,setReady]=useState(false);
  const [error,setError]=useState('');
  const [paymentState,setPaymentState]=useState<string|null>(null);

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);setPaymentState(params.get('payment'));
    const chosen=params.get('plan');if(chosen){const selected=getPaymentPlan(chosen);if(selected)setPlanId(selected.id);else setPlanValid(false)}
    try{
      const raw=sessionStorage.getItem('meulocal_checkout_context');
      if(raw){const c=JSON.parse(raw) as CheckoutContext;setName(c.name||'');setEmail(c.email||'');setPhone(c.phone||'');setBusinessName(c.businessName||'');}
    }catch{}
    setReady(true);
  },[]);

  async function startCheckout(e:FormEvent){
    e.preventDefault(); setError('');
    if(!planValid){setError('Escolha um plano válido para continuar.');return}
    setLoading(true);
    // Reuse the confirmed public payment page. Never put personal data in its URL.
    window.location.assign(`https://www.asaas.com/000/c/${plan.paymentLinkId}`);
  }

  if(!ready)return <main className="checkoutPage"><section className="checkoutHero container"><p>Carregando ativação...</p></section></main>;
  return <main className="checkoutPage">
    <header className="nav container">
      <a className="brand" href="/"><span className="brandMark"><MapPin size={19}/></span>MeuLocal</a>
      <a className="navCta" href="/#planos"><ArrowLeft size={16}/> Voltar aos planos</a>
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
          <div className={styles.field}><label htmlFor="checkout-plan">Plano</label><select id="checkout-plan" className={styles.control} value={planId} onChange={e=>{setPlanId(e.target.value as PaymentPlanId);setPlanValid(true);setError('')}} disabled={loading}>
            <option value="essencial">Essencial</option><option value="inteligencia">Inteligência</option>
          </select></div>
          <span>MeuLocal {plan.name}</span>
          <h2>{(plan.amountCents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}/mês</h2>
          <p>{planId==='essencial'?'Automatize os pedidos de avaliação e acompanhe sua reputação.':'Tudo do Essencial, mais análise de temas e resumo semanal com prioridades. Camada de inteligência em desenvolvimento.'}</p>
          {!planValid&&<div className="loginError" role="alert">O plano informado não é válido. Escolha um dos planos abaixo.</div>}
          <p>Sem reunião. Sem complicação. Cancele quando quiser.</p>
          <div className={styles.fields}>
            <div className={styles.field}><label htmlFor="checkout-name">Nome</label><input id="checkout-name" className={styles.control} value={name} onChange={e=>setName(e.target.value)} required autoComplete="name" placeholder="Seu nome completo" maxLength={200}/></div>
            <div className={styles.field}><label htmlFor="checkout-email">E-mail</label><input id="checkout-email" className={styles.control} type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email" placeholder="voce@empresa.com.br" maxLength={320}/></div>
            <div className={styles.field}><label htmlFor="checkout-phone">WhatsApp <span className={styles.optional}>(opcional)</span></label><input id="checkout-phone" className={styles.control} type="tel" value={phone} onChange={e=>setPhone(e.target.value)} autoComplete="tel" placeholder="(11) 99999-9999" maxLength={40}/></div>
          </div>
          {error&&<div className={styles.error} role="alert">{error}</div>}
          <button className="primary checkoutButton" type="submit" disabled={loading||!planValid}>{loading?'Abrindo pagamento...':<>Ir para pagamento do {plan.name} <ArrowRight size={18}/></>}</button>
          <small>Pagamento seguro pelo Asaas. Os dados de cobrança serão confirmados no Asaas. A ativação ocorre após confirmação do pagamento.</small>
        </form>
      </div>

      <div className="checkoutTrust"><span><Check size={15}/> Ativação online</span><span><Check size={15}/> Sem reunião obrigatória</span><span><Check size={15}/> Acompanhamento contínuo</span></div>
    </section>
  </main>;
}
