import { NextRequest, NextResponse } from 'next/server';

const fields = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.websiteUri',
  'places.primaryType',
].join(',');

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function presenceBand(score: number) {
  if (score <= 30) return { key: 'critical', label: 'Crítica' };
  if (score <= 50) return { key: 'weak', label: 'Fraca' };
  if (score <= 70) return { key: 'competitive', label: 'Competitiva' };
  return { key: 'strong', label: 'Forte' };
}

export async function POST(req: NextRequest) {
  try {
    const place = await req.json();
    if (!place?.id || !place?.latitude || !place?.longitude) {
      return NextResponse.json({ error: 'Empresa inválida.' }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Google Places não configurado.' }, { status: 500 });
    }

    const body: Record<string, unknown> = {
      languageCode: 'pt-BR',
      regionCode: 'BR',
      maxResultCount: 20,
      rankPreference: 'POPULARITY',
      locationRestriction: {
        circle: {
          center: { latitude: place.latitude, longitude: place.longitude },
          radius: 3000,
        },
      },
    };

    if (place.category) body.includedTypes = [place.category];

    const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': fields,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    const payload = await response.json();
    if (!response.ok) {
      return NextResponse.json({ error: payload?.error?.message || 'Falha ao analisar concorrentes.' }, { status: response.status });
    }

    const competitors = (payload.places || [])
      .filter((p: any) => p.id !== place.id)
      .map((p: any) => ({
        id: p.id,
        name: p.displayName?.text || '',
        address: p.formattedAddress || '',
        rating: p.rating ?? null,
        reviewCount: p.userRatingCount ?? 0,
        website: p.websiteUri || null,
        category: p.primaryType || null,
      }))
      .sort((a: any, b: any) => (b.reviewCount || 0) - (a.reviewCount || 0))
      .slice(0, 3);

    const avgReviews = competitors.length
      ? competitors.reduce((sum: number, c: any) => sum + (c.reviewCount || 0), 0) / competitors.length
      : 0;

    const reviewScore = avgReviews > 0
      ? clamp(((place.reviewCount || 0) / avgReviews) * 100)
      : (place.reviewCount || 0) > 0 ? 50 : 0;

    const ratingScore = clamp((((place.rating || 0) - 3) / 2) * 100);
    const profileScore = place.website ? 70 : 45;
    const seoScore = place.website ? 55 : 35;
    const authorityScore = 40;

    const score = Math.round(
      reviewScore * 0.45 +
      ratingScore * 0.15 +
      profileScore * 0.15 +
      seoScore * 0.15 +
      authorityScore * 0.10
    );

    const band = presenceBand(score);
    const gainPotential = score <= 50 ? 'Alto' : score <= 70 ? 'Médio' : 'Baixo';
    const reviewGap = Math.max(0, Math.round(avgReviews - (place.reviewCount || 0)));

    const gaps = [
      reviewGap > 0 ? `Seus principais concorrentes têm, em média, ${Math.round(avgReviews)} avaliações. Você tem ${place.reviewCount || 0}.` : null,
      !place.website ? 'Seu perfil não apresenta um site associado, o que reduz sinais de autoridade e conversão.' : null,
      (place.rating || 0) < 4.5 ? `Sua nota média é ${place.rating || 'sem nota'}, abaixo do nível normalmente associado aos líderes locais.` : null,
    ].filter(Boolean);

    return NextResponse.json({
      business: place,
      competitors,
      metrics: {
        score,
        band: band.label,
        bandKey: band.key,
        gainPotential,
        avgCompetitorReviews: Math.round(avgReviews),
        reviewGap,
        reviewScore: Math.round(reviewScore),
        ratingScore: Math.round(ratingScore),
      },
      gaps,
    });
  } catch {
    return NextResponse.json({ error: 'Não foi possível concluir a análise agora.' }, { status: 500 });
  }
}
