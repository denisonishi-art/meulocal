'use client';

import { FormEvent, useState } from 'react';
import { ArrowLeft, ArrowRight, Building2, Check, MapPin, Search } from 'lucide-react';

type Place = { id:string; name:string; address:string; rating:number|null; reviewCount:number; category:string|null; latitude?:number|null; longitude?:number|null; website?:string|null; phone?:string|null };
type Analysis = { business:Place; competitors:Place[]; metrics:{score:number; band:string; bandKey:string; gainPotential:string; avgCompetitorReviews:number; reviewGap:number}; gaps:string[] };

export default function DiagnosticoPage() {
  const [query,setQuery]=useState('');
  const [places,setPlaces]=useState<Place[]>([]);
  const [loading,setLoading]=useState(false);
  const [analyzing,setAnalyzing]=useState(false);
  const [analysis,setAnalysis]=useState<Analysis|null>(null);
  const [error,setError]=useState('');

  async function submit(e:FormEvent){
    e.preventDefault(); setError(''); setLoading(true); setPlaces([]); setAnalysis(null);
    try{
      const res=await fetch('/api/places/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query})});
      const data=await res.json(); if(!res.ok) throw new Error(data.error||'Não foi possível buscar.'); setPlaces(data.places||[]);
    }catch(err:any){setError(err.message||'Não foi possível buscar.')}finally{setLoading(false)}
  }

  async function analyze(place:Place){
    setError(''); setAnalyzing(true); setAnalysis(null);
    try{
      const res=await fetch('/api/places/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(place)});
      const data=await res.json(); if(!res.ok) throw new Error(data.error||'Não foi possível analisar.');
      setAnalysis(data); setPlaces([]);
    }catch(err:any){setError(err.message||'Não foi possível analisar.')}finally{setAnalyzing(false)}
  }

  const scoreClass=analysis?`scoreBadge ${analysis.metrics.bandKey}`:'scoreBadge';

  return <main className="diagnosticPage">
    <header className="nav container"><a className="brand" href="/"><span className="brandMark"><MapPin size={19}/></span>MeuLocal</a><a className="navCta" href="/"><ArrowLeft size={16}/> Voltar</a></header>

    <section className="diagnosticHero container">
      <div className="eyebrow"><span></span>Diagnóstico gratuito</div>
      <h1>Descubra sua Nota de Presença Local.</h1>
      <p>Encontre seu negócio no Google e veja como ele está comparado aos concorrentes da região.</p>

      {!analysis && <form className="businessSearch" onSubmit={submit}>
        <label htmlFor="business">Nome da empresa + cidade ou bairro</label>
        <div className="searchRow"><div className="searchInputWrap"><Search size={19}/><input id="business" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Ex.: Clínica Sorriso Moema São Paulo" required minLength={3}/></div><button className="primary" type="submit" disabled={loading||analyzing}>{loading?'Buscando...':<>Encontrar empresa <ArrowRight size={18}/></>}</button></div>
        <small>Usamos dados públicos do Google para localizar sua empresa.</small>
      </form>}

      {error&&<div className="diagError">{error}</div>}

      {places.length>0&&<section className="placeResults" aria-live="polite"><div className="resultHeader"><div><span>Encontramos estas empresas</span><h2>Qual delas é a sua?</h2></div><small>{places.length} resultado(s)</small></div><div className="placeList">{places.map(p=><button className="placeCard" key={p.id} type="button" onClick={()=>analyze(p)} disabled={analyzing}><div className="placeIcon"><Building2 size={20}/></div><div className="placeText"><strong>{p.name}</strong><span>{p.address}</span><small>{p.rating?`★ ${p.rating}`:'Sem nota'} · {p.reviewCount} avaliações</small></div><ArrowRight size={18}/></button>)}</div></section>}

      {analyzing&&<div className="analysisLoading"><strong>Analisando sua presença local...</strong><span>Comparando sua empresa com negócios relevantes em um raio de 3 km.</span></div>}

      {analysis&&<section className="analysisResult">
        <div className="analysisTop"><div><span>Resultado preliminar</span><h2>{analysis.business.name}</h2><p>{analysis.business.address}</p></div><div className={scoreClass}><strong>{analysis.metrics.score}</strong><span>/100</span><small>{analysis.metrics.band}</small></div></div>
        <div className="gainLine"><span>Potencial de ganho</span><strong>{analysis.metrics.gainPotential}</strong></div>
        <div className="analysisGrid"><div><small>Suas avaliações</small><strong>{analysis.business.reviewCount}</strong></div><div><small>Média dos 3 concorrentes</small><strong>{analysis.metrics.avgCompetitorReviews}</strong></div><div><small>Gap de avaliações</small><strong>{analysis.metrics.reviewGap}</strong></div></div>
        {analysis.gaps.length>0&&<div className="gapBox"><span>O que encontramos</span>{analysis.gaps.map((g,i)=><p key={i}>• {g}</p>)}</div>}
        <div className="competitorList"><span>Concorrentes usados na comparação</span>{analysis.competitors.map((c,i)=><div key={c.id}><strong>{i+1}. {c.name}</strong><small>{c.reviewCount} avaliações · {c.rating?`★ ${c.rating}`:'sem nota'}</small></div>)}</div>
        <div className="unlockBox"><h3>Quer ver o que eu corrigiria primeiro no seu caso?</h3><p>Na próxima etapa liberamos o plano resumido e enviamos sua análise por e-mail e WhatsApp.</p><button className="primary" type="button">Quero ver como melhorar <ArrowRight size={18}/></button></div>
      </section>}
    </section>

    <section className="diagTrust container"><div><Check size={16}/> Gratuito</div><div><Check size={16}/> Sem compromisso</div><div><Check size={16}/> Resultado objetivo</div></section>
  </main>;
}
