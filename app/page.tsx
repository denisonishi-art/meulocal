import plansStyles from './plans.module.css';
import { ArrowRight, BarChart3, Bot, Check, Link2, MapPin, Search, Star, TrendingUp, Upload, Users } from 'lucide-react';

const benefits = [
  { icon: Star, title: 'Mais avaliações', text: 'Seus clientes recebem pedidos e lembretes automáticos para avaliar sua empresa no Google.' },
  { icon: Search, title: 'Mais presença no Google', text: 'Analisamos seu posicionamento e comparamos sua empresa com quem disputa os mesmos clientes e buscas.' },
  { icon: TrendingUp, title: 'Saiba quando algo exigir atenção', text: 'Monitoramento de avaliações em validação. A proposta é avisar o responsável sobre notas baixas ou reclamações, sem escrever ou publicar respostas.' }
];

const howItWorks = [
  { icon: Search, title: 'Descobrimos onde você está', text: 'Analisamos sua presença no Google, suas avaliações e os concorrentes que disputam os mesmos clientes.' },
  { icon: Link2, title: 'Conectamos sua empresa', text: 'Você conecta seu Perfil da Empresa no Google e seu WhatsApp. Nosso assistente conduz o processo.' },
  { icon: Upload, title: 'O MeuLocal começa a trabalhar', text: 'Você disponibiliza seus próprios clientes. O MeuLocal organiza os contatos, envia os pedidos de avaliação e faz os acompanhamentos automaticamente.' },
  { icon: TrendingUp, title: 'Sua reputação começa a crescer', text: 'Novas avaliações chegam ao Google e acompanhamos volume, nota, velocidade e comparação competitiva.' },
  { icon: BarChart3, title: 'Você acompanha a evolução', text: 'Seu dashboard mostra se sua reputação melhorou, quantas avaliações ganhou e como sua empresa está evoluindo.' }
];

const afterHiring = [
  ['Pagamento confirmado', 'Seu acesso ao MeuLocal é liberado.'],
  ['Falamos com você pelo WhatsApp', 'Seu assistente MeuLocal conduz a ativação e mostra o próximo passo.'],
  ['Você conecta Google e WhatsApp', 'Quando uma autorização depende de você, enviamos o link e orientamos o processo.'],
  ['Operação ativa', 'O MeuLocal passa a executar a régua de avaliações com a base que sua empresa disponibiliza.'],
  ['Você acompanha os resultados', 'Entre no MeuLocal quando quiser e veja a evolução da sua reputação.']
];

const planFeatures = [
  'Importação da sua base por CSV, sem integrar CRM',
  'Pedidos e lembretes automáticos de avaliação',
  'Perfil da Empresa no Google conectado, obrigatório',
  'Painel com nota e evolução das avaliações',
];

const intelligenceFeatures = [
  'IA identifica elogios e problemas recorrentes',
  'Compara os temas com o período anterior',
  'Resumo semanal com até três ações prioritárias',
  'Recomendações sustentadas pelas avaliações',
];

const faqs = [
  ['Qual é a diferença entre os planos?', 'O Essencial automatiza os pedidos de avaliação e o acompanhamento da reputação. O Inteligência acrescenta análise de temas, comparação entre períodos e um resumo semanal com até três ações prioritárias. Essa camada está em desenvolvimento; a contratação dos novos planos será liberada após validação.'],
  ['E se minha empresa tiver poucas avaliações?', 'O plano Inteligência deverá informar quando não houver dados suficientes para concluir uma tendência. As recomendações serão sustentadas pelas avaliações disponíveis, sem inventar padrões.'],
  ['O MeuLocal cria avaliações?', 'Não. O MeuLocal facilita o pedido de avaliações reais aos clientes da sua própria empresa.'],
  ['De onde vêm os clientes que recebem os pedidos?', 'Da sua empresa. Você disponibiliza sua própria base de clientes ou contatos elegíveis; o MeuLocal não busca consumidores fora da sua operação.'],
  ['Preciso aprender a usar um software?', 'Não. O assistente MeuLocal conduz a configuração e a maior parte da operação acontece automaticamente.'],
  ['Como meus clientes recebem os pedidos?', 'Principalmente por WhatsApp e, quando fizer sentido, também por e-mail.'],
  ['O MeuLocal garante nota 5 no Google?', 'Não. O objetivo é aumentar a frequência de avaliações legítimas e melhorar continuamente sua reputação.'],
  ['Posso acompanhar os resultados?', 'Sim. Seu dashboard mostra as principais métricas e a evolução da sua reputação no Google.'],
  ['Como funciona o monitoramento de avaliações?', 'O monitoramento está em validação. Com seu Perfil da Empresa no Google conectado, a frequência planejada é de hora em hora. Notas de 1 ou 2 estrelas geram alerta prioritário; notas de 3 estrelas e reclamações relevantes no texto também exigem atenção. Se a análise do texto não puder ser concluída, avisamos que o caso precisa ser conferido.'],
  ['Em quanto tempo recebo um alerta?', 'A meta em validação é avisar em até 3 horas a partir da postagem da avaliação, com a integração e o canal de alerta ativos. Esse prazo ainda não está comprovado em operação real. O aviso vai para o e-mail verificado do responsável pela conta. A entrega e as falhas são acompanhadas; se o acesso expirar, o monitoramento precisa ser restabelecido.'],
  ['O MeuLocal responde às avaliações?', 'Não. A inteligência artificial ajuda a identificar reclamações para avisar você. Nenhuma resposta é escrita ou publicada no Google pelo MeuLocal.'],
  ['Preciso integrar meu CRM?', 'Não. Envie sua base por CSV. Você precisa conectar o Perfil da Empresa no Google para ativar o serviço; o assistente orienta a configuração do canal e a revisão da base antes de qualquer envio.']
];

export default function Home() {
  return (
    <main>
      <header className="nav container">
        <a className="brand" href="#top" aria-label="MeuLocal - início"><span className="brandMark"><MapPin size={19}/></span>MeuLocal</a>
        <div style={{display:'flex',alignItems:'center',gap:20}}>
          <a className="navCta loginNavCta" href="/login">Entrar</a>
          <a className="navCta" href="/diagnostico">Descobrir minha nota <ArrowRight size={16}/></a>
        </div>
      </header>

      <section id="top" className="hero container">
        <div className="eyebrow"><span></span>Crescimento local, sem complicação</div>
        <h1>Mais avaliações.<br/><em>Mais presença no Google.</em><br/>Mais clientes locais.</h1>
        <p className="lead">Automatize pedidos de avaliação com sua base de clientes em CSV. Acompanhe sua reputação sem integrar seu CRM. Os alertas de avaliações estão em validação e ainda não são apresentados como serviço operacional.</p>
        <div className="heroActions">
          <a className="primary" href="/diagnostico">Descubra sua Nota de Presença Local grátis <ArrowRight size={18}/></a>
          <span className="micro"><Check size={15}/> Análise simples e objetiva</span>
          <a className="navCta" href="#planos">Conhecer os planos <ArrowRight size={16}/></a>
        </div>
        <div className="dashboard" aria-label="Exemplo de evolução local">
          <div className="dashHead"><div><span className="dot"></span>Seu crescimento local</div><span>Dados ilustrativos · Últimos 30 dias</span></div>
          <div className="metrics">
            <div><small>Avaliações no Google</small><strong>41 <span>→ 53</span></strong><b>+29%</b></div>
            <div><small>Posição média</small><strong>7,2 <span>→ 5,4</span></strong><b>↑ 1,8</b></div>
            <div><small>Nota no Google</small><strong>4,6 <span>→ 4,7</span></strong><b>↑</b></div>
            <div><small>Nota de Presença Local</small><strong>72 <span>→ 83</span></strong><b>+11 pts</b></div>
          </div>
        </div>
      </section>

      <section className="proof"><div className="container proofInner"><p>O cliente procura. <strong>O Google decide quem aparece.</strong> Nós ajudamos sua empresa a estar entre as melhores opções.</p></div></section>

      <section className="section introProduct container">
        <div className="sectionIntro">
          <div className="eyebrow"><span></span>O que é o MeuLocal</div>
          <h2>O MeuLocal trabalha para sua empresa ser mais escolhida no Google.</h2>
          <p>O MeuLocal é uma plataforma de crescimento para negócios locais. Conectamos sua empresa ao Google, identificamos onde você está perdendo espaço para concorrentes e trabalhamos continuamente para aumentar sua reputação, avaliações e presença local.</p>
          <p className="strongCopy">Você não precisa aprender uma nova ferramenta nem administrar campanhas. O MeuLocal acompanha, executa e mostra a evolução.</p>
        </div>
      </section>

      <section className="howSection">
        <div className="container">
          <div className="sectionIntro">
            <div className="eyebrow"><span></span>Como funciona</div>
            <h2>Do diagnóstico à evolução da sua reputação.</h2>
            <p>Um processo simples, guiado e contínuo para transformar clientes reais da sua empresa em novas oportunidades de avaliação.</p>
          </div>
          <div className="steps">
            {howItWorks.map(({icon: Icon,title,text},i)=><article className="step" key={title}><div className="stepTop"><span>0{i+1}</span><div className="icon"><Icon size={21}/></div></div><h3>{title}</h3><p>{text}</p></article>)}
          </div>
          <p className="baseNote"><Users size={17}/> O MeuLocal não busca clientes fora da sua operação. Ele trabalha com os clientes que a própria empresa disponibiliza.</p>
        </div>
      </section>

      <section className="section container">
        <div className="sectionIntro"><div className="eyebrow"><span></span>O que fazemos</div><h2>Três coisas que movem o seu negócio.</h2><p>Sem relatórios gigantes. Sem termos complicados. Foco no que ajuda sua empresa a ser encontrada e escolhida.</p></div>
        <div className="cards">{benefits.map(({icon: Icon,title,text},i)=><article className="card" key={title}><div className="num">0{i+1}</div><div className="icon"><Icon size={22}/></div><h3>{title}</h3><p>{text}</p></article>)}</div>
      </section>

      <section className="assistantSection">
        <div className="container assistantGrid">
          <div className="assistantVisual"><Bot size={34}/><span>Seu assistente MeuLocal</span><strong>Menos operação para você.<br/>Mais trabalho acontecendo.</strong></div>
          <div>
            <div className="eyebrow"><span></span>Assistência contínua</div>
            <h2>Você não recebe apenas um dashboard.</h2>
            <p>Depois da contratação, seu assistente MeuLocal conduz o onboarding pelo WhatsApp, ajuda nas conexões necessárias e acompanha a operação. Quando uma etapa exige uma ação sua, ele orienta. Quando pode ser automatizada, o MeuLocal executa.</p>
            <p className="strongCopy">Você acompanha a evolução. O MeuLocal cuida da rotina.</p>
          </div>
        </div>
      </section>

            <section className="compare"><div className="container compareGrid"><div><div className="eyebrow light"><span></span>Inteligência competitiva</div><h2>Você sabe como está comparado às empresas que disputam os mesmos clientes?</h2><p>Dependendo do seu mercado, isso pode significar negócios próximos, empresas da mesma região ou concorrentes que aparecem para as mesmas buscas no Google.</p><ul><li><Check/>Diferença de avaliações</li><li><Check/>Disputa por buscas e intenção</li><li><Check/>Qualidade do site e SEO Local</li><li><Check/>Autoridade e oportunidades</li></ul></div><div className="score"><small>NOTA DE PRESENÇA LOCAL</small><div className="scoreValue">42<span>/100</span></div><div className="scoreBar"><i style={{width:'42%'}}></i></div><strong>Presença fraca · Potencial de ganho: Alto</strong><p>Quanto menor a nota, mais atenção sua presença precisa. O potencial mostra o espaço real para ganhar dos concorrentes relevantes para o seu mercado.</p></div></div></section>

      <section id="planos" className={`section container ${plansStyles.section}`} aria-labelledby="plans-heading">
        <div className="sectionIntro">
          <div className="eyebrow"><span></span>Planos MeuLocal</div>
          <h2 id="plans-heading">Automatize sua rotina.<br/>Entenda onde melhorar.</h2>
          <p>Escolha entre acompanhar sua reputação e transformar as avaliações em prioridades para o seu negócio.</p>
        </div>
        <div className={plansStyles.grid}>
          <article className={plansStyles.card} aria-labelledby="essential-heading">
            <span className={plansStyles.kicker}>Automação da rotina</span>
            <h3 id="essential-heading">Essencial</h3>
            <p className={plansStyles.description}>Automatize os pedidos de avaliação e acompanhe sua reputação.</p>
            <p className={plansStyles.price}>R$189<span>/mês</span></p>
            <ul className={plansStyles.features}>
              {planFeatures.map(feature=><li key={feature}><Check size={18} aria-hidden="true"/><span>{feature}</span></li>)}
              <li><Check size={18} aria-hidden="true"/><span>Monitoramento e alertas ao responsável <small>Em validação · meta de até 3 horas*</small></span></li>
            </ul>
            <a className="primary" href="/diagnostico">Começar pelo diagnóstico grátis <ArrowRight size={16} aria-hidden="true"/></a>
          </article>
          <article className={`${plansStyles.card} ${plansStyles.featured}`} aria-labelledby="intelligence-heading">
            <span className={plansStyles.kicker}>Inteligência para melhorar</span>
            <h3 id="intelligence-heading">Inteligência</h3>
            <p className={plansStyles.description}>Descubra o que seus clientes estão dizendo e onde melhorar.</p>
            <p className={plansStyles.price}>R$289<span>/mês</span></p>
            <p className={plansStyles.included}>Tudo do Essencial, mais:</p>
            <ul className={plansStyles.features}>
              {intelligenceFeatures.map(feature=><li key={feature}><Check size={18} aria-hidden="true"/><span>{feature}</span></li>)}
            </ul>
            <p className={plansStyles.status}>Análise de temas e resumo semanal em desenvolvimento.</p>
            <a className="primary" href="/diagnostico">Conhecer pelo diagnóstico grátis <ArrowRight size={16} aria-hidden="true"/></a>
          </article>
        </div>
        <div className={plansStyles.notes}>
          <p><strong>Nos dois planos:</strong> o MeuLocal monitora e avisa. Nenhuma resposta é escrita ou publicada no Google.</p>
          <p>* Monitoramento em validação: consulta horária planejada e meta de aviso em até 3 horas a partir da postagem da avaliação, com integração Google e canal de alerta ativos. O prazo ainda não foi comprovado em operação real.</p>
          <p>Os novos planos estão em preparação. A contratação será liberada após validação das entregas e configuração do pagamento. O diagnóstico continua gratuito.</p>
          <p>No Inteligência, dados insuficientes serão informados; o relatório não apresentará tendências sem evidência.</p>
        </div>
      </section>

      <section className="section container afterHire">
        <div className="sectionIntro">
          <div className="eyebrow"><span></span>Depois da contratação</div>
          <h2>Contratou. E agora?</h2>
          <p>Você sabe exatamente o que acontece a partir do pagamento.</p>
        </div>
        <div className="afterHireList">
          {afterHiring.map(([title,text],i)=><article key={title}><span>0{i+1}</span><div><h3>{title}</h3><p>{text}</p></div></article>)}
        </div>
      </section>

      <section className="aboutStrip">
        <div className="container aboutGrid">
          <div>
            <div className="eyebrow"><span></span>Quem somos</div>
            <h2>Tecnologia para tornar crescimento local mais simples.</h2>
          </div>
          <div>
            <p>O MeuLocal nasceu com uma ideia simples: pequenos negócios não deveriam precisar dominar marketing digital, SEO, automações e inteligência artificial para competir no Google.</p>
            <p>Criamos uma plataforma que transforma dados e tecnologia em ações simples, automáticas e mensuráveis para negócios locais.</p>
            <a href="/sobre">Conheça o MeuLocal <ArrowRight size={16}/></a>
          </div>
        </div>
      </section>

      <section className="section container faqSection">
        <div className="sectionIntro">
          <div className="eyebrow"><span></span>Perguntas frequentes</div>
          <h2>O que você precisa saber antes de começar.</h2>
        </div>
        <div className="faqList">
          {faqs.map(([question,answer])=><details key={question}><summary>{question}</summary><p>{answer}</p></details>)}
        </div>
      </section>

      <section id="diagnostico" className="cta container"><div className="ctaBox"><div><div className="eyebrow"><span></span>Comece por aqui</div><h2>Descubra sua Nota de Presença Local.</h2><p>Veja como você está em relação aos concorrentes relevantes e quais oportunidades merecem atenção primeiro.</p></div><a className="primary" href="/diagnostico">Fazer diagnóstico grátis <ArrowRight size={18}/></a></div></section>

      <footer className="footer container"><a className="brand" href="#top"><span className="brandMark"><MapPin size={17}/></span>MeuLocal</a><p>Mais presença no Google. Mais clientes locais.</p><nav aria-label="Links institucionais"><a href="/avaliacoes-google">Avaliações Google</a> · <a href="/seo-local">SEO Local</a> · <a href="/sobre">Sobre</a> · <a href="/privacidade">Privacidade</a> · <a href="/termos">Termos</a></nav><span>© 2026 MeuLocal</span></footer>
    </main>
  );
}
