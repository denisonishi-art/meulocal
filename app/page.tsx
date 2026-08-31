import { ArrowRight, Check, MapPin, Search, Star, TrendingUp } from 'lucide-react';

const benefits = [
  { icon: Star, title: 'Mais avaliações', text: 'Seus clientes recebem pedidos e lembretes automáticos para avaliar sua empresa no Google.' },
  { icon: Search, title: 'Mais presença no Google', text: 'Analisamos seu posicionamento e comparamos sua empresa com quem disputa os mesmos clientes e buscas.' },
  { icon: TrendingUp, title: 'Mais autoridade local', text: 'Encontramos oportunidades reais de presença, conteúdo e autoridade que fortalecem sua empresa.' }
];

export default function Home() {
  return (
    <main>
      <header className="nav container">
        <a className="brand" href="#top" aria-label="MeuLocal - início"><span className="brandMark"><MapPin size={19}/></span>MeuLocal</a>
        <div style={{display:'flex',alignItems:'center',gap:20}}>
          <a className="navCta" href="/login">Entrar</a>
          <a className="navCta" href="/diagnostico">Descobrir minha nota <ArrowRight size={16}/></a>
        </div>
      </header>

      <section id="top" className="hero container">
        <div className="eyebrow"><span></span>Crescimento local, sem complicação</div>
        <h1>Mais avaliações.<br/><em>Mais presença no Google.</em><br/>Mais clientes locais.</h1>
        <p className="lead">Ajudamos negócios a fortalecer reputação no Google, conquistar mais avaliações e ganhar espaço de quem disputa os mesmos clientes.</p>
        <div className="heroActions">
          <a className="primary" href="/diagnostico">Descubra sua Nota de Presença Local grátis <ArrowRight size={18}/></a>
          <span className="micro"><Check size={15}/> Análise simples e objetiva</span>
        </div>
        <div className="dashboard" aria-label="Exemplo de evolução local">
          <div className="dashHead"><div><span className="dot"></span>Seu crescimento local</div><span>Últimos 30 dias</span></div>
          <div className="metrics">
            <div><small>Avaliações no Google</small><strong>41 <span>→ 53</span></strong><b>+29%</b></div>
            <div><small>Posição média</small><strong>7,2 <span>→ 5,4</span></strong><b>↑ 1,8</b></div>
            <div><small>Nota no Google</small><strong>4,6 <span>→ 4,7</span></strong><b>↑</b></div>
            <div><small>Nota de Presença Local</small><strong>72 <span>→ 83</span></strong><b>+11 pts</b></div>
          </div>
        </div>
      </section>

      <section className="proof"><div className="container proofInner"><p>O cliente procura. <strong>O Google decide quem aparece.</strong> Nós ajudamos sua empresa a estar entre as melhores opções.</p></div></section>

      <section className="section container">
        <div className="sectionIntro"><div className="eyebrow"><span></span>O que fazemos</div><h2>Três coisas que movem o seu negócio.</h2><p>Sem relatórios gigantes. Sem termos complicados. Foco no que ajuda sua empresa a ser encontrada e escolhida.</p></div>
        <div className="cards">{benefits.map(({icon: Icon,title,text},i)=><article className="card" key={title}><div className="num">0{i+1}</div><div className="icon"><Icon size={22}/></div><h3>{title}</h3><p>{text}</p></article>)}</div>
      </section>

      <section className="compare"><div className="container compareGrid"><div><div className="eyebrow light"><span></span>Inteligência competitiva</div><h2>Você sabe como está comparado às empresas que disputam os mesmos clientes?</h2><p>Dependendo do seu mercado, isso pode significar negócios próximos, empresas da mesma região ou concorrentes que aparecem para as mesmas buscas no Google.</p><ul><li><Check/>Diferença de avaliações</li><li><Check/>Disputa por buscas e intenção</li><li><Check/>Qualidade do site e SEO Local</li><li><Check/>Autoridade e oportunidades</li></ul></div><div className="score"><small>NOTA DE PRESENÇA LOCAL</small><div className="scoreValue">42<span>/100</span></div><div className="scoreBar"><i style={{width:'42%'}}></i></div><strong>Presença fraca · Potencial de ganho: Alto</strong><p>Quanto menor a nota, mais atenção sua presença precisa. O potencial mostra o espaço real para ganhar dos concorrentes relevantes para o seu mercado.</p></div></div></section>

      <section id="diagnostico" className="cta container"><div className="ctaBox"><div><div className="eyebrow"><span></span>Comece por aqui</div><h2>Descubra sua Nota de Presença Local.</h2><p>Veja como você está em relação aos concorrentes relevantes e quais oportunidades merecem atenção primeiro.</p></div><a className="primary" href="/diagnostico">Fazer diagnóstico grátis <ArrowRight size={18}/></a></div></section>

      <footer className="footer container"><a className="brand" href="#top"><span className="brandMark"><MapPin size={17}/></span>MeuLocal</a><p>Mais presença no Google. Mais clientes locais.</p><nav aria-label="Links institucionais"><a href="/avaliacoes-google">Avaliações Google</a> · <a href="/seo-local">SEO Local</a> · <a href="/sobre">Sobre</a> · <a href="/privacidade">Privacidade</a> · <a href="/termos">Termos</a></nav><span>© 2026 MeuLocal</span></footer>
    </main>
  );
}