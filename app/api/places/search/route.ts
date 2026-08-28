import { NextRequest, NextResponse } from 'next/server';

const fields = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.websiteUri',
  'places.nationalPhoneNumber',
  'places.primaryType',
].join(',');

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();
    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Informe empresa e localização.' }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Google Places não configurado.' }, { status: 500 });
    }

    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': fields,
      },
      body: JSON.stringify({
        textQuery: query,
        languageCode: 'pt-BR',
        regionCode: 'BR',
        maxResultCount: 8,
      }),
      cache: 'no-store',
    });

    const payload = await response.json();
    if (!response.ok) {
      return NextResponse.json({ error: payload?.error?.message || 'Falha ao consultar Google Places.' }, { status: response.status });
    }

    const places = (payload.places || []).map((p: any) => ({
      id: p.id,
      name: p.displayName?.text || '',
      address: p.formattedAddress || '',
      latitude: p.location?.latitude ?? null,
      longitude: p.location?.longitude ?? null,
      rating: p.rating ?? null,
      reviewCount: p.userRatingCount ?? 0,
      website: p.websiteUri || null,
      phone: p.nationalPhoneNumber || null,
      category: p.primaryType || null,
    }));

    return NextResponse.json({ places });
  } catch {
    return NextResponse.json({ error: 'Não foi possível buscar agora.' }, { status: 500 });
  }
}
