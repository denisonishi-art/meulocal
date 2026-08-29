import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;

    if (!url || !key) {
      return NextResponse.json({ error: 'Integração de leads não configurada.' }, { status: 500 });
    }

    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase.functions.invoke('submit-diagnostic', {
      body: payload,
    });

    if (error) {
      return NextResponse.json({ error: 'Não foi possível salvar seus dados.' }, { status: 502 });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Não foi possível salvar seus dados agora.' }, { status: 500 });
  }
}
