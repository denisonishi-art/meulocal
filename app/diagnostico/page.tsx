'use client';

import { FormEvent, useState } from 'react';
import { ArrowLeft, ArrowRight, Building2, Check, MapPin, Search } from 'lucide-react';

type Place = { id:string; name:string; address:string; rating:number|null; reviewCount:number; category:string|null; latitude?:number|null; longitude?:number|null; website?:string|null; phone?:string|null };
type Analysis = { business:Place; competitors:Place[]; metrics:{score:number; band:string; bandKey:string; gainPotential:string; avgCompetitorReviews:number|null; reviewGap:number|null; reviewScore?:number|null; ratingScore?:number|null}; gaps:string[] };

export default function DiagnosticoPage() {
  const [query,setQuery]=useState('');
  const [places,setPlaces]=useState<Place[]>([]);
  const [loading,setLoading]=useState(false);
  const [analyzing,setAnalyzing]=useState(false);
  const [analysis,setAnalysis]=useState<Analysis|null>(null);
  const [showLead,setShowLead]=useState(false);
  const [name,setName]=useState('');
  const [email,setEmail]=useState('');
  const [whatsapp,setWhatsapp]=useState('');
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');

  async function submit(e:FormEvent){
    e.preventDefault(); setError(''); setLoading(true); setPlaces([]); setAnalysis(null); setShowLead(false);
    try{
      const res=await fetch('/api/places/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query})});
      const data=await res.json(); if(!res.ok) throw new Error(data.error||'Não foi possível buscar.'); setPlaces(data.places||[]);
    }catch(err:any){setError(err.message||'Não foi possível buscar.')}finally{setLoading(false)}
  }

  async function analyze(place:Place){
    setError(''); setAnalyzing(true); setAnalysis(null); setShowLead(false);
    try{
      const res=await fetch('/api/places/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(place)});
      const data=await res.json(); if(!res.ok) throw new Error(data.error||'Não foi possível analisar.');
      setAnalysis(data); setPlaces([]);
    }catch(err:any){setError(err.message||'Não foi possível analisar.')}finally{setAnalyzing(false)}
  }

  async function saveLead(e:FormEvent){
    e.preventDefault();
    if(!analysis) return;
    setError(''); setSaving(true);
    try{
      const payload={
        business:{
          google_place_id:analysis.business.id,
          name:analysis.business.name,
          category:analysis.business.category,
          address:analysis.business.address,
          latitude:analysis.business.latitude,
          longitude:analysis.business.longitude,
          phone:analysis.business.phone,
          website:analysis.business.website,
          google_rating:analysis.business.rating,
          google_review_count:analysis.business.reviewCount,
          source:'inbound'
        },
        lead:{name,email,whatsapp,consent_email:true,consent_whatsapp:true,origin:'home_diagnostic'},
        diagnostic:{
          presence_score:analysis.metrics.score,
          gain_potential:analysis.metrics.gainPotential==='Alto'?'high':analysis.metrics.gainPotential==='Médio'?'medium':'low',
          review_score:analysis.metrics.reviewScore??null,
          local_seo_score:analysis.business.website?55:35,
          authority_score:40,
          profile_score:analysis.business.website?70:45,
          primary_gap:analysis.gaps[0]||null,
          summary:`Nota de Presença Local ${analysis.metrics.score}/100 — ${analysis.metrics.band}.`,
          recommendations:analysis.gaps
        },
        competitors:analysis.competitors.map((c,i)=>({
          google_place_id:c.id,
          name:c.name,
          google_rating:c.rating,
          google_review_count:c.reviewCount,
          rank_position:i+1,
          website:c.website||null
        }))
      };
      const res=await fetch('/api/leads/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const data=await res.json(); if(!res.ok) throw new Error(data.error||'Não foi possível salvar seus dados.');
      window.location.href='/contratar';
    }catch(err:any){setError(err.message||'Não foi possível salvar seus dados.')}finally{setSaving(false)}
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
        <div className="searchRow"><div className="searchInputWrap"><Search size={19}/><input id="business" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Ex.: Barbearia Chácara Santo Antônio São Paulo" required minLength={3}/></div><button className="primary" type="submit" disabled={loading||analyzing}>{loading?'Buscando...':<>Encontrar empresa <ArrowRight size={18}/></>}</button></div>
        <small>Usamos dados públicos do Google para localizar sua empresa.</small>
      </form>}

      {error&&<div className="diagError">{error}</div>}

      {places.length>0&&<section className="placeResults" aria-live="polite"><div className="resultHeader"><div><span>Encontramos estas empresas</span><h2>Qual delas é a sua?</h2></div><small>{places.length} resultado(s)</small></div><div className="placeList">{places.map(p=><button className="placeCard" key={p.id} type="button" onClick={()=>analyze(p)} disabled={analyzing}><div className="placeIcon"><Building2 size={20}/></div><div className="placeText"><strong>{p.name}</strong><span>{p.address}</span><small>{p.rating?`★ ${p.rating}`:'Sem nota'} · {p.reviewCount} avaliações</small></div><ArrowRight size={18}/></button>)}</div></section>}

      {analyzing&&<div className="analysisLoading"><strong>Analisando sua presença local...</strong><span>Comparando sua empresa com negócios relevantes em um raio de 3 km.</span></div>}

      {analysis&&<section className="analysisResult">
        <div className="analysisTop"><div><span>Resultado preliminar</span><h2>{analysis.business.name}</h2><p>{analysis.business.address}</p></div><div className={scoreClass}><strong>{analysis.metrics.score}</strong><span>/100</span><small>{analysis.metrics.band}</small></div></div>
        <div className="gainLine"><span>Potencial de ganho</span><strong>{analysis.metrics.gainPotential}</strong></div>
        <div className="analysisGrid"><div><small>Suas avaliações</small><strong>{analysis.business.reviewCount}</strong></div><div><small>Média dos concorrentes</small><strong>{analysis.metrics.avgCompetitorReviews??'—'}</strong></div><div><small>Gap de avaliações</small><strong>{analysis.metrics.reviewGap??'—'}</strong></div></div>
        {analysis.gaps.length>0&&<div className="gapBox"><span>O que encontramos</span>{analysis.gaps.map((g,i)=><p key={i}>• {g}</p>)}</div>}
        <div className="competitorList"><span>Concorrentes usados na comparação</span>{analysis.competitors.map((c,i)=><div key={c.id}><strong>{i+1}. {c.name}</strong><small>{c.reviewCount} avaliações · {c.rating?`★ ${c.rating}`:'sem nota'}</small></div>)}</div>

        {!showLead?<div className="unlockBox"><h3>Quer ver como melhorar sua presença local?</h3><p>Receba sua análise e avance direto para ativar o MeuLocal — sem reunião.</p><button className="primary" type="button" onClick={()=>setShowLead(true)}>Quero melhorar minha presença <ArrowRight size={18}/></button></div>:
        <form className="leadCapture" onSubmit={saveLead}>
          <div><span>Último passo</span><h3>Para onde enviamos sua análise?</h3><p>Preencha seus dados para salvar o diagnóstico e seguir para a ativação.</p></div>
          <label>Seu nome<input value={name} onChange={e=>setName(e.target.value)} required/></label>
          <label>E-mail<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label>
          <label>WhatsApp<input value={whatsapp} onChange={e=>setWhatsapp(e.target.value)} placeholder="(11) 99999-9999" required/></label>
          <small>Ao continuar, você concorda em receber sua análise e comunicações relacionadas ao MeuLocal por e-mail e WhatsApp.</small>
          <button className="primary" type="submit" disabled={saving}>{saving?'Salvando...':<>Continuar <ArrowRight size={18}/></>}</button>
        </form>}
      </section>}
    </section>

    <section className="diagTrust container"><div><Check size={16}/> Gratuito</div><div><Check size={16}/> Sem compromisso</div><div><Check size={16}/> Resultado objetivo</div></section>
  </main>;
}
