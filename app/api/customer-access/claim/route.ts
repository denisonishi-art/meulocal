import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

async function context(request: Request) {
  const authorization = request.headers.get('authorization');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!authorization?.startsWith('Bearer ') || !url || !anonKey || !serviceKey) return null;

  const client = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: { user } } = await client.auth.getUser(authorization.slice(7));
  if (!user?.email || !user.email_confirmed_at) return null;

  return { user, admin: createClient(url, serviceKey, { auth: { persistSession: false } }) };
}

export async function POST(request: Request) {
  const ctx = await context(request);
  if (!ctx) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });

  const { data: current } = await ctx.admin
    .from('customer_accounts')
    .select('business_id')
    .eq('user_id', ctx.user.id)
    .maybeSingle();
  if (current) return NextResponse.json({ ok: true, linked: true, businessId: current.business_id });

  const { data: leads } = await ctx.admin
    .from('leads')
    .select('business_id')
    .eq('email', ctx.user.email)
    .limit(2);
  const businessIds = [...new Set((leads || []).map((lead) => lead.business_id))];
  if (businessIds.length !== 1) {
    return NextResponse.json({ error: 'Não encontramos uma ativação vinculada a este e-mail.' }, { status: 404 });
  }

  const { data: account } = await ctx.admin
    .from('customer_accounts')
    .select('id,business_id')
    .eq('business_id', businessIds[0])
    .eq('payment_status', 'active')
    .is('user_id', null)
    .maybeSingle();
  if (!account) {
    return NextResponse.json({ error: 'Este acesso já está vinculado ou a ativação ainda não foi confirmada.' }, { status: 409 });
  }

  const { data: linked, error } = await ctx.admin
    .from('customer_accounts')
    .update({ user_id: ctx.user.id })
    .eq('id', account.id)
    .is('user_id', null)
    .select('business_id')
    .maybeSingle();
  if (error || !linked) return NextResponse.json({ error: 'Não foi possível vincular seu acesso. Tente novamente.' }, { status: 409 });

  return NextResponse.json({ ok: true, linked: true, businessId: linked.business_id });
}
