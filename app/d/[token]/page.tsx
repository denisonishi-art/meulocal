import {notFound} from 'next/navigation';
import {createClient} from '@supabase/supabase-js';
import {ArrowRight,MapPin,Star,TrendingDown} from 'lucide-react';
import './diagnostic.css';

export const dynamic='force-dynamic';

export default async function ProspectDiagnosticPage({params}:{params:{token:string}}){
  const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!supabaseUrl||!serviceKey)notFound();
  const admin=createClient(supabaseUrl,serviceKey);
  const {data}=await admin.from('prospect_diagnostics').select('*').eq('public_token',params.token).maybeSingle();
  if(!data)notFound();
  if(!data.diagnostic_opened_at)await admin.from('prospect_diagnostics').update({diagnostic_opened_at:new Date().toISOString()}).eq('id',data.id);

  const score=Number(data.score||0);
  const band=score<=30?'Crítico':score<=50?'Fraco':score<=70?'Competitivo':'Forte';
  const avg=data.competitor_avg_reviews==null?null:Number(data.competitor_avg_reviews);
  const gap=data.review_gap==null?null:Number(data.review_gap);
  const cta=`/api/prospect-diagnostic/click?token=${encodeURIComponent(params.token)}`;

  return <main className="pdPage">
    <header className="pdNav"><a href="/" className="brand"><span className="brandMark"><MapPin size={19}/></span>MeuLocal</a><span>Diagnóstico de presença local</span></header>
    <section className="pdHero">
      <span className="pdEyebrow">ANÁLISE DA SUA EMPRESA NO GOOGLE</span>
      <h1>{data.business_name}</h1>
      {data.address&&<p>{data.address}</p>}
      <div className={`pdScore pdScore${band}`}><small>Score MeuLocal</small><strong>{score}<span>/100</span></strong><b>{band}</b></div>
      <p className="pdLead">Quanto menor o Score, maior a distância entre sua reputação atual e o potencial de presença local do seu negócio.</p>
    </section>

    <section className="pdGrid">
      <article><span>Sua nota no Google</span><strong>{data.rating==null?'—':Number(data.rating).toFixed(1)} <Star size={18}/></strong></article>
      <article><span>Suas avaliações</span><strong>{Number(data.review_count||0)}</strong></article>
      <article><span>Média dos concorrentes</span><strong>{avg==null?'—':avg}</strong></article>
    </section>

    {gap!=null&&gap>0&&<section className="pdGap"><TrendingDown size={25}/><div><span>PRINCIPAL OPORTUNIDADE</span><h2>Você está {gap} avaliações atrás da média dos concorrentes próximos.</h2><p>Quando clientes comparam negócios semelhantes no Google, volume, frequência e qualidade das avaliações ajudam a construir confiança antes mesmo do primeiro contato.</p></div></section>}

    <section className="pdCta"><span>PRÓXIMO PASSO</span><h2>Quer saber como melhorar suas avaliações?</h2><p>Veja como o MeuLocal ajuda negócios locais a fortalecer a reputação no Google sem depender de pedidos manuais.</p><a className="primary" href={cta}>Quero melhorar minhas avaliações <ArrowRight size={18}/></a></section>
    <footer className="pdFooter">Diagnóstico gerado pelo MeuLocal com dados públicos disponíveis no momento da análise.</footer>
  </main>;
}
