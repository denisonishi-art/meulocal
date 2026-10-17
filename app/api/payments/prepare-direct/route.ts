import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {consumeRateLimit} from '@/lib/rate-limit';
import {getPaymentPlan} from '@/lib/payments/plans';
export async function POST(request:Request){
 const rate=await consumeRateLimit(request,'direct_checkout_prepare',5,60);
 if(!rate.allowed)return NextResponse.json({error:'Muitas tentativas. Aguarde um minuto.'},{status:429});
 try{
  const raw=await request.text();
  if(Buffer.byteLength(raw)>4096)return NextResponse.json({error:'Dados inválidos.'},{status:400});
  const input=JSON.parse(raw),plan=getPaymentPlan(input?.planId);
  if(!plan||![input?.name,input?.email,input?.businessName,input?.city].every(x=>typeof x==='string'&&x.trim()))
   return NextResponse.json({error:'Informe os dados da empresa e selecione um plano.'},{status:400});
  if(!/^\S+@\S+\.\S+$/.test(input.email)||input.name.length>200||input.email.length>320||input.businessName.length>200||input.city.length>120||typeof(input.phone??'')!=='string'||(input.phone??'').length>40)
   return NextResponse.json({error:'Dados inválidos.'},{status:400});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)return NextResponse.json({error:'Contratação indisponível.'},{status:503});
  const db=createClient(url,key,{auth:{persistSession:false}});
  const {data:catalog,error:catalogError}=await db.from('payment_plan_catalog').select('checkout_enabled,amount_cents').eq('id',plan.id).maybeSingle();
  if(catalogError||!catalog||catalog.checkout_enabled!==true||catalog.amount_cents!==plan.amountCents)
   return NextResponse.json({error:'Contratação ainda não liberada.'},{status:503});
  const {data,error}=await db.rpc('prepare_direct_checkout',{p_business_name:input.businessName,p_city:input.city,p_name:input.name,p_email:input.email,p_phone:input.phone||null});
  if(error||!data?.businessId||!data?.leadId)return NextResponse.json({error:'Não foi possível vincular sua empresa.'},{status:503});
  return NextResponse.json({businessId:data.businessId,leadId:data.leadId},{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({error:'Não foi possível preparar a contratação.'},{status:503});}
}
