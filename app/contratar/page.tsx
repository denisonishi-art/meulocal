import { ArrowLeft, ArrowRight, Check, MapPin, Star, TrendingUp } from 'lucide-react';

export default function ContratarPage(){
  return <main className="checkoutPage">
    <header className="nav container">
      <a className="brand" href="/"><span className="brandMark"><MapPin size={19}/></span>MeuLocal</a>
      <a className="navCta" href="/diagnostico"><ArrowLeft size={16}/> Voltar</a>
    </header>

    <section className="checkoutHero container">
      <div className="eyebrow"><span></span>Ativação simples</div>
      <h1>Fortaleça sua reputação.<br/>Apareça mais. Venda mais.</h1>
      <p>Ative o MeuLocal e comece a transformar sua presença no Google em mais confiança e mais oportunidades de venda.</p>

      <div className="checkoutCard">
        <div className="checkoutBenefits">
          <article><div className="benefitIcon"><Star size={22}/></div><div><strong>Mais avaliações para construir uma reputação que gera mais vendas</strong><p>Crie consistência na sua reputação sem depender de pedidos manuais.</p></div></article>
          <article><div className="benefitIcon"><TrendingUp size={22}/></div><div><strong>Mais visibilidade para ser encontrado e escolhido por clientes da sua região</strong><p>Fortaleça sua presença local e acompanhe onde agir primeiro.</p></div></article>
        </div>

        <div className="checkoutAction">
          <span>Plano MeuLocal</span>
          <h2>Sem reunião. Sem complicação.</h2>
          <p>Configuração rápida e acompanhamento contínuo.</p>
          <button className="primary checkoutButton" type="button" disabled>Ativar MeuLocal <ArrowRight size={18}/></button>
          <small>O pagamento será habilitado na próxima etapa de integração.</small>
        </div>
      </div>

      <div className="checkoutTrust"><span><Check size={15}/> Ativação online</span><span><Check size={15}/> Sem reunião obrigatória</span><span><Check size={15}/> Acompanhamento contínuo</span></div>
    </section>
  </main>;
}
