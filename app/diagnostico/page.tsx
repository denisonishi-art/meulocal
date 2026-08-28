'use client';

import { FormEvent, useState } from 'react';
import { ArrowLeft, ArrowRight, Building2, Check, MapPin, Search } from 'lucide-react';

type Place = {
  id: string;
  name: string;
  address: string;
  rating: number | null;
  reviewCount: number;
  category: string | null;
};

export default function DiagnosticoPage() {
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    setPlaces([]);
    try {
      const res = await fetch('/api/places/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Não foi possível buscar.');
      setPlaces(data.places || []);
    } catch (err: any) {
      setError(err.message || 'Não foi possível buscar.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="diagnosticPage">
      <header className="nav container">
        <a className="brand" href="/"><span className="brandMark"><MapPin size={19}/></span>MeuLocal</a>
        <a className="navCta" href="/"><ArrowLeft size={16}/> Voltar</a>
      </header>

      <section className="diagnosticHero container">
        <div className="eyebrow"><span></span>Diagnóstico gratuito</div>
        <h1>Descubra sua Nota de Presença Local.</h1>
        <p>Encontre seu negócio no Google e veja como ele será comparado aos concorrentes da região.</p>

        <form className="businessSearch" onSubmit={submit}>
          <label htmlFor="business">Nome da empresa + cidade ou bairro</label>
          <div className="searchRow">
            <div className="searchInputWrap"><Search size={19}/><input id="business" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Ex.: Clínica Sorriso Moema São Paulo" required minLength={3}/></div>
            <button className="primary" type="submit" disabled={loading}>{loading ? 'Buscando...' : <>Encontrar empresa <ArrowRight size={18}/></>}</button>
          </div>
          <small>Usamos dados públicos do Google para localizar sua empresa.</small>
        </form>

        {error && <div className="diagError">{error}</div>}

        {places.length > 0 && (
          <section className="placeResults" aria-live="polite">
            <div className="resultHeader"><div><span>Encontramos estas empresas</span><h2>Qual delas é a sua?</h2></div><small>{places.length} resultado(s)</small></div>
            <div className="placeList">
              {places.map((p)=>(
                <button className="placeCard" key={p.id} type="button">
                  <div className="placeIcon"><Building2 size={20}/></div>
                  <div className="placeText"><strong>{p.name}</strong><span>{p.address}</span><small>{p.rating ? `★ ${p.rating}` : 'Sem nota'} · {p.reviewCount} avaliações</small></div>
                  <ArrowRight size={18}/>
                </button>
              ))}
            </div>
          </section>
        )}
      </section>

      <section className="diagTrust container"><div><Check size={16}/> Gratuito</div><div><Check size={16}/> Sem compromisso</div><div><Check size={16}/> Resultado objetivo</div></section>
    </main>
  );
}
