import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';

const allowed=['pending','in_progress','completed'] as const;

async function context(request:Request){
  const auth=request.headers.get('authorization');const url=process.env.NEXT_PUBLIC_SUPABASE_URL,anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,service=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!auth?.startsWith('Bearer ')||!url||!anon||!service)return null;
  const client=createClient(url,anon,{global:{headers:{Authorization:auth}}});const {data:{user}}=await client.auth.getUser(auth.slice(7));if(!user)return null;
  return {user,admin:createClient(url,service)};
}

export async function GET(request:Request){
  const ctx=await context(request);if(!ctx)return NextResponse.json({error:'Não autorizado.'},{status:401});
  const {data}=await ctx.admin.from('customer_accounts').select('business_id,onboarding_status,payment_status,payment_provider,paid_at').eq('user_id',ctx.user.id).maybeSingle();
  if(!data)return NextResponse.json({error:'Conta de cliente não encontrada.'},{status:404});
  return NextResponse.json({ok:true,...data,canStartOnboarding:data.payment_status==='active'});
}

export async function POST(request:Request){
  const ctx=await context(request);if(!ctx)return NextResponse.json({error:'Não autorizado.'},{status:401});
  const body=await request.json().catch(()=>({}));const status=body.status as typeof allowed[number];
  if(!allowed.includes(status))return NextResponse.json({error:'Estado de onboarding inválido.'},{status:400});
  const {data:account}=await ctx.admin.from('customer_accounts').select('payment_status').eq('user_id',ctx.user.id).maybeSingle();
  if(!account)return NextResponse.json({error:'Conta de cliente não encontrada.'},{status:404});
  if(status!=='pending'&&account.payment_status!=='active')return NextResponse.json({error:'Onboarding só pode avançar após pagamento confirmado.'},{status:409});
  const {error}=await ctx.admin.from('customer_accounts').update({onboarding_status:status}).eq('user_id',ctx.user.id);
  if(error)return NextResponse.json({error:'Não foi possível atualizar o onboarding.'},{status:500});
  return NextResponse.json({ok:true,status});
}
