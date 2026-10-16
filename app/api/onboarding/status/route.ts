import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
const headers={'Cache-Control':'private, no-store'};
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers});
const unavailable=()=>json({error:'Não foi possível consultar ou salvar a configuração. Tente novamente.'},503);
async function context(request:Request){
 const auth=request.headers.get('authorization'),url=process.env.NEXT_PUBLIC_SUPABASE_URL,anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,service=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!auth?.startsWith('Bearer ')||!url||!anon||!service)return null;
 const options={auth:{persistSession:false},global:{fetch:(input:RequestInfo|URL,init?:RequestInit)=>fetch(input,{...init,signal:AbortSignal.timeout(5000)})}};
 const client=createClient(url,anon,options),{data:{user},error}=await client.auth.getUser(auth.slice(7));if(error||!user)return null;
 return {user,admin:createClient(url,service,options)};
}
export async function GET(request:Request){try{
 const ctx=await context(request);if(!ctx)return json({error:'Não autorizado.'},401);
 const {data,error}=await ctx.admin.from('customer_accounts').select('business_id,onboarding_status,payment_status,payment_provider,paid_at').eq('user_id',ctx.user.id).maybeSingle();
 if(error)return unavailable();if(!data)return json({error:'Conta de cliente não encontrada.'},404);
 return json({ok:true,...data,canStartOnboarding:data.payment_status==='active'});
}catch{return unavailable()}}
export async function POST(request:Request){try{
 const ctx=await context(request);if(!ctx)return json({error:'Não autorizado.'},401);
 const body=await request.json().catch(()=>({}));
 if(!['pending','in_progress','completed'].includes(body.status))return json({error:'Estado de onboarding inválido.'},400);
 const {data,error}=await ctx.admin.rpc('record_customer_onboarding',{p_user_id:ctx.user.id,p_status:body.status,p_business_confirmed:body.businessConfirmed===true,p_confirmed:body.confirmed===true});
 if(error){const code=error.message||'';
  if(code.includes('onboarding_access_denied'))return json({error:'Conta de cliente não encontrada.'},404);
  if(code.includes('onboarding_google_required'))return json({error:'Conecte o Google e conclua a primeira sincronização antes de finalizar.'},409);
  if(code.includes('onboarding_payment_required'))return json({error:'Onboarding só pode avançar após pagamento confirmado.'},409);
  if(code.includes('onboarding_confirmation_required')||code.includes('onboarding_business_confirmation_required'))return json({error:'Confirme seu negócio e a conclusão da configuração antes de continuar.'},409);
  return unavailable();
 }
 if(data?.ok!==true)return unavailable();return json(data);
}catch{return unavailable()}}
