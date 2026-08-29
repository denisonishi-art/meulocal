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

type NearbyPlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
  websiteUri?: string;
  primaryType?: string;
};

type Competitor = {
  id: string;
  name: string;
  address: string;
  rating: number | null;
  reviewCount: number;
  website: string | null;
  category: string | null;
  reviewDataReliable: boolean;
};

export async function POST(req: NextRequest) {
  try {
    const place = await req.json();
    if (!place?.id || place?.latitude == null || place?.longitude == null) {
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

    const allCompetitors: Competitor[] = (payload.places || [])
      .filter((p: NearbyPlace) => p.id && p.id !== place.id)
      .map((p: NearbyPlace) => {
        const reviewCount = typeof p.userRatingCount === 'number' ? p.userRatingCount : 0;
        return {
          id: p.id || '',
          name: p.displayName?.text || '',
          address: p.formattedAddress || '',
          rating: typeof p.rating === 'number' ? p.rating : null,
          reviewCount,
          website: p.websiteUri || null,
          category: p.primaryType || null,
          reviewDataReliable: reviewCount > 0,
        };
      });

    // Zero/missing review counts are not used as competitive evidence. They may be
    // incomplete Google data and must not artificially improve or damage a score.
    const reliableCompetitors = allCompetitors
      .filter((c) => c.reviewDataReliable)
      .sort((a, b) => b.reviewCount - a.reviewCount)
      .slice(0, 3);

    const competitors = reliableCompetitors.length >= 2
      ? reliableCompetitors
      : allCompetitors.sort((a, b) => b.reviewCount - a.reviewCount).slice(0, 3);

    const scoringCompetitors = competitors.filter((c) => c.reviewDataReliable);
    const avgReviews = scoringCompetitors.length
      ? scoringCompetitors.reduce((sum, c) => sum + c.reviewCount, 0) / scoringCompetitors.length
      : 0;

    const businessReviewCount = typeof place.reviewCount === 'number' ? place.reviewCount : 0;
    const businessReviewDataReliable = businessReviewCount > 0;
    const competitorReviewDataReliable = scoringCompetitors.length >= 2;
    const reviewComparisonReliable = businessReviewDataReliable && competitorReviewDataReliable;

    const reviewScore = reviewComparisonReliable
      ? clamp((businessReviewCount / avgReviews) * 100)
      : null;

    const ratingScore = typeof place.rating === 'number'
      ? clamp(((place.rating - 3) / 2) * 100)
      : null;

    const profileScore = place.website ? 70 : 45;
    const seoScore = place.website ? 55 : 35;
    const authorityScore = 40;

    // If review data is unreliable, redistribute its 45% weight over the remaining
    // observable components instead of treating a suspicious zero as fact.
    const components = [
      reviewScore == null ? null : { value: reviewScore, weight: 0.45 },
      ratingScore == null ? null : { value: ratingScore, weight: 0.15 },
      { value: profileScore, weight: 0.15 },
      { value: seoScore, weight: 0.15 },
      { value: authorityScore, weight: 0.10 },
    ].filter((component): component is { value: number; weight: number } => component !== null);

    const totalWeight = components.reduce((sum, component) => sum + component.weight, 0);
    const score = Math.round(
      components.reduce((sum, component) => sum + component.value * component.weight, 0) / totalWeight
    );

    const band = presenceBand(score);
    const gainPotential = score <= 50 ? 'Alto' : score <= 70 ? 'Médio' : 'Baixo';
    const reviewGap = reviewComparisonReliable
      ? Math.max(0, Math.round(avgReviews - businessReviewCount))
      : null;

    const dataWarnings: string[] = [];
    if (!businessReviewDataReliable) {
      dataWarnings.push('O Google não retornou uma contagem confiável de avaliações para esta empresa. Esse dado foi excluído do cálculo.');
    }
    if (!competitorReviewDataReliable) {
      dataWarnings.push('Não encontramos pelo menos dois concorrentes com contagem confiável de avaliações. A comparação de reviews foi excluída do cálculo.');
    }

    const gaps = [
      reviewGap != null && reviewGap > 0
        ? `Seus principais concorrentes têm, em média, ${Math.round(avgReviews)} avaliações. Você tem ${businessReviewCount}.`
        : null,
      !place.website ? 'Seu perfil não apresenta um site associado, o que reduz sinais de autoridade e conversão.' : null,
      typeof place.rating === 'number' && place.rating < 4.5
        ? `Sua nota média é ${place.rating}, abaixo do nível normalmente associado aos líderes locais.`
        : null,
    ].filter((gap): gap is string => Boolean(gap));

    return NextResponse.json({
      business: place,
      competitors,
      metrics: {
        score,
        band: band.label,
        bandKey: band.key,
        gainPotential,
        avgCompetitorReviews: reviewComparisonReliable ? Math.round(avgReviews) : null,
        reviewGap,
        reviewScore: reviewScore == null ? null : Math.round(reviewScore),
        ratingScore: ratingScore == null ? null : Math.round(ratingScore),
        reviewComparisonReliable,
      },
      dataQuality: {
        status: dataWarnings.length ? 'partial' : 'reliable',
        warnings: dataWarnings,
        reliableCompetitors: scoringCompetitors.length,
      },
      gaps,
    });
  } catch {
    return NextResponse.json({ error: 'Não foi possível concluir a análise agora.' }, { status: 500 });
  }
}
