import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { consumeRateLimit } from '@/lib/rate-limit';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  const rate = await consumeRateLimit(request, 'customer_access_invite', 3, 60);
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Aguarde um minuto antes de solicitar outro acesso.' }, { status: 429 });
  }

  const { email: rawEmail } = await request.json().catch(() => ({}));
  const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
  if (!emailPattern.test(email)) return NextResponse.json({ error: 'Informe um e-mail válido.' }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.json({ error: 'Acesso ainda não configurado.' }, { status: 503 });
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: leads } = await admin
    .from('leads')
    .select('business_id')
    .ilike('email', email)
    .order('created_at', { ascending: false })
    .limit(2);
  const businessIds = [...new Set((leads || []).map((lead: { business_id: string }) => lead.business_id))];
  if (businessIds.length !== 1) return NextResponse.json({ ok: true });

  const { data: account } = await admin
    .from('customer_accounts')
    .select('id,user_id,payment_status')
    .eq('business_id', businessIds[0])
    .maybeSingle();
  if (!account || account.payment_status !== 'active') return NextResponse.json({ ok: true });

  if (account.user_id) return NextResponse.json({ ok: true, alreadyLinked: true });

  const { data: users, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (usersError) return NextResponse.json({ error: 'Não foi possível preparar seu acesso.' }, { status: 500 });
  const existing = users.users.find((user) => user.email?.toLowerCase() === email);
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.meulocal.ia.br').replace(/\/$/, '');

  if (existing) {
    const { error } = await admin.from('customer_accounts').update({ user_id: existing.id }).eq('id', account.id);
    if (error) return NextResponse.json({ error: 'Não foi possível vincular seu acesso.' }, { status: 500 });
    return NextResponse.json({ ok: true, alreadyLinked: true });
  }

  const { data: invitation, error: invitationError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${appUrl}/login?reset=1`,
  });
  if (invitationError || !invitation.user) return NextResponse.json({ error: 'Não foi possível enviar o convite agora.' }, { status: 500 });

  const { error: accountError } = await admin.from('customer_accounts').update({ user_id: invitation.user.id }).eq('id', account.id);
  if (accountError) return NextResponse.json({ error: 'Convite enviado, mas o acesso precisa ser revisado.' }, { status: 500 });

  return NextResponse.json({ ok: true, sent: true });
}
