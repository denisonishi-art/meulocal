import {notFound} from 'next/navigation';
import {createClient} from '@supabase/supabase-js';
import {ArrowRight,MapPin,Star,TrendingDown} from 'lucide-react';
import './diagnostic.css';
import OpenTracker from './OpenTracker';
import type {LocalComparison} from '@/lib/competitors/hermes-comparative-report';

export const dynamic='force-dynamic';

export default async function ProspectDiagnosticPage({params}:{params:{token:string}}){
  const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!supabaseUrl||!serviceKey)notFound();
  const admin=createClient(supabaseUrl,serviceKey);
  const {data}=await admin.from('prospect_diagnostics').select('*').eq('public_token',params.token).maybeSingle();
  if(!data)notFound();

  // Reports are scoped to the unguessable diagnostic token and expire after 30 days.
  const {data:comparison}=await admin.from('prospect_comparison_reports')
   .select('google_place_id,snapshot,expires_at').eq('diagnostic_id',data.id).maybeSingle();
  const current=Boolean(comparison?.google_place_id===data.place_id&&
   typeof comparison?.expires_at==='string'&&Date.parse(comparison.expires_at)>Date.now()&&
   ['meulocal_top3_v1','meulocal_top3_v2'].includes(comparison?.snapshot?.version)&&[3000,5000].includes(comparison.snapshot.radiusMeters)&&
   Array.isArray(comparison.snapshot.competitors)&&comparison.snapshot.competitors.length>0);
  const report:LocalComparison|null=current?comparison!.snapshot as LocalComparison:null;
  const score=Number(data.score||0);
  const band=score<=30?'Crítico':score<=50?'Fraco':score<=70?'Competitivo':'Forte';
  const avg=report?.averageCompetitorReviews??null;
  const gap=report?.reviewGap??null;
  const cta=`/api/prospect-diagnostic/click?token=${encodeURIComponent(params.token)}`;

  return <main className="pdPage"><OpenTracker token={params.token}/>
    <header className="pdNav"><a href="/" className="brand"><span className="brandMark"><MapPin size={19}/></span>MeuLocal</a><span>Diagnóstico de presença local</span></header>
    <section className="pdHero">
      <span className="pdEyebrow">ANÁLISE DA SUA EMPRESA NO GOOGLE</span>
      <h1>{data.business_name}</h1>
      {data.address&&<p>{data.address}</p>}
      <div className={`pdScore pdScore${band}`}><small>Score MeuLocal</small><strong>{score}<span>/100</span></strong><b>{band}</b></div>
      <p className="pdLead">O Score MeuLocal é um indicador interno de triagem de reputação; não representa previsão de vendas nem posição em resultados de busca.</p>
    </section>

    <section className="pdGrid">
      <article><span>Sua nota no Google</span><strong>{report?report.business.rating.toFixed(1):data.rating==null?'—':Number(data.rating).toFixed(1)} <Star size={18}/></strong></article>
      <article><span>Suas avaliações</span><strong>{report?report.business.reviewCount:Number(data.review_count||0)}</strong></article>
      <article><span>Média dos concorrentes</span><strong>{avg==null?'—':avg}</strong></article>
    </section>
    {report?<section className="pdComparison">
      <span className="pdEyebrow">BENCHMARK LOCAL · ATÉ {report.radiusMeters/1000} KM</span>
      <h2>Quem disputa os mesmos clientes na região?</h2>
      <p>Comparação com até três concorrentes relevantes encontrados no Google Maps, ordenados pelo critério MeuLocal de nota ajustada ao volume de avaliações. Pesquisa de {new Date(report.observedAt).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'})}.</p>
      <div className="pdComparisonList">{report.competitors.map((c,i)=><article key={c.id}>
        <div><strong>{i+1}. {c.name}</strong><span>{c.address}</span></div>
        <div><b>{c.rating.toFixed(1)} ★</b><small>{c.reviewCount} avaliações · {c.distanceKm.toFixed(2).replace('.',',')} km</small></div>
      </article>)}</div>
      {gap!=null&&gap>0&&<p className="pdComparisonOpportunity"><strong>Oportunidade:</strong> sua empresa tem {gap} avaliações a menos que a média desses {report.competitors.length} concorrentes selecionados. Isso é uma diferença de presença pública, não uma previsão de vendas.</p>}
      {report.warnings.length>0&&<div className="pdComparisonNotes">{report.warnings.map((w,i)=><p key={i}>{w}</p>)}</div>}
      <small>Fonte: perfis públicos do Google Places. A busca retorna uma amostra limitada e pode não incluir todos os negócios da região; os dados podem mudar. Nunca é uma classificação oficial do Google.</small>
      <h3>Três ações para fortalecer sua reputação</h3>
      <ol>{report.recommendations.map((r,i)=><li key={i}>{r}</li>)}</ol>
    </section>:<section className="pdComparison"><h2>Comparação local em preparação</h2><p>Esta página mostra dados preliminares de reputação. A comparação com concorrentes da região (preferência por 3 km, limite de 5 km) será disponibilizada quando as evidências forem verificadas.</p></section>}

    {gap!=null&&gap>0&&<section className="pdGap"><TrendingDown size={25}/><div><span>PRINCIPAL OPORTUNIDADE</span><h2>Você tem {gap} avaliações a menos que a média dos concorrentes selecionados em até {report?.radiusMeters?report.radiusMeters/1000:3} km.</h2><p>Quando clientes comparam negócios semelhantes no Google, volume, frequência e qualidade das avaliações ajudam a construir confiança antes mesmo do primeiro contato.</p></div></section>}

    <section className="pdCta"><span>PRÓXIMO PASSO</span><h2>Quer saber como melhorar suas avaliações?</h2><p>Veja como o MeuLocal ajuda negócios locais a fortalecer a reputação no Google sem depender de pedidos manuais.</p><a className="primary" href={cta}>Quero melhorar minhas avaliações <ArrowRight size={18}/></a></section>
    <footer className="pdFooter">Diagnóstico gerado pelo MeuLocal com dados públicos disponíveis no momento da análise.</footer>
  </main>;
}
