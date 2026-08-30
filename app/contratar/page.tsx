'use client';

import {FormEvent,useEffect,useState} from 'react';
import { ArrowLeft, ArrowRight, Check, MapPin, Star, TrendingUp } from 'lucide-react';

type CheckoutContext={businessId:string|null;leadId:string|null;name:string;email:string;phone:string;businessName?:string};

export default function ContratarPage(){
  const [name,setName]=useState('');
  const [email,setEmail]=useState('');
  const [phone,setPhone]=useState('');
  const [businessId,setBusinessId]=useState<string|null>(null);
  const [leadId,setLeadId]=useState<string|null>(null);
  const [businessName,setBusinessName]=useState('');
  const [loading,setLoading]=useState(false);
  const [ready,setReady]=useState(false);
  const [error,setError]=useState('');
  const [paymentState,setPaymentState]=useState<string|null>(null);

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);setPaymentState(params.get('payment'));
    try{
      const raw=sessionStorage.getItem('meulocal_checkout_context');
      if(raw){const c=JSON.parse(raw) as CheckoutContext;setName(c.name||'');setEmail(c.email||'');setPhone(c.phone||'');setBusinessId(c.businessId||null);setLeadId(c.leadId||null);setBusinessName(c.businessName||'');}
    }catch{}
    setReady(true);
  },[]);

  async function startCheckout(e:FormEvent){
    e.preventDefault(); setError('');
    if(!businessId||!leadId){setError('Faça o diagnóstico gratuito antes de iniciar a assinatura.');return}
    setLoading(true);
    try{
      const res=await fetch('/api/payments/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,email,phone,businessId,leadId})});
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
      {paymentState==='expired'&&<div className="loginError">Este checkout expirou. Gere uma nova cobrança para continuar.</div>}

      <div className="checkoutCard">
        <div className="checkoutBenefits">
          <article><div className="benefitIcon"><Star size={22}/></div><div><strong>Mais avaliações para construir uma reputação que gera mais vendas</strong><p>Crie consistência na sua reputação sem depender de pedidos manuais.</p></div></article>
          <article><div className="benefitIcon"><TrendingUp size={22}/></div><div><strong>Mais visibilidade para ser encontrado e escolhido</strong><p>Fortaleça sua presença no Google e acompanhe onde agir primeiro.</p></div></article>
        </div>

        <form className="checkoutAction" onSubmit={startCheckout}>
          <span>Plano MeuLocal</span>
          <h2>R$ 397/mês</h2>
          <p>Sem reunião. Sem complicação. Cancele quando quiser.</p>
          <label>Nome<input value={name} onChange={e=>setName(e.target.value)} required autoComplete="name"/></label>
          <label>E-mail<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email" readOnly={Boolean(leadId)}/></label>
          <label>WhatsApp<input value={phone} onChange={e=>setPhone(e.target.value)} autoComplete="tel" placeholder="(11) 99999-9999"/></label>
          {!businessId||!leadId?<div className="loginError">Para ativar, comece pelo diagnóstico gratuito para vincular corretamente sua empresa.</div>:null}
          {error&&<small role="alert">{error}</small>}
          <button className="primary checkoutButton" type="submit" disabled={loading||!businessId||!leadId}>{loading?'Abrindo pagamento...':<>Ativar MeuLocal <ArrowRight size={18}/></>}</button>
          {!businessId||!leadId?<a className="linkButton" href="/diagnostico">Fazer diagnóstico grátis</a>:<small>Pagamento seguro processado pelo Asaas. A ativação ocorre após confirmação do pagamento.</small>}
        </form>
      </div>

      <div className="checkoutTrust"><span><Check size={15}/> Ativação online</span><span><Check size={15}/> Sem reunião obrigatória</span><span><Check size={15}/> Acompanhamento contínuo</span></div>
    </section>
  </main>;
}
