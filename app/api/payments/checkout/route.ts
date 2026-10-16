import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {createRecurringCheckout,ensureAsaasConfigured} from '@/lib/payments/asaas';
import {getPaymentPlan} from '@/lib/payments/plans';
import {consumeRateLimit} from '@/lib/rate-limit';

export const maxDuration=60;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req:Request){
 const rate=await consumeRateLimit(req,'payment_checkout',5,60);
 if(!rate.allowed)return NextResponse.json({error:'Muitas tentativas de ativação. Aguarde um minuto e tente novamente.'},{status:429,headers:{'Retry-After':'60'}});
 let admin:any,intent:any;
 try{
  const raw=await req.text();if(Buffer.byteLength(raw)>32768)return NextResponse.json({error:'Dados de ativação inválidos.'},{status:400});
  let input:any;try{input=JSON.parse(raw)}catch{return NextResponse.json({error:'Dados de ativação inválidos.'},{status:400})}
  const {name,email,phone,businessId,leadId,planId}=input||{};
  const plan=getPaymentPlan(planId);
  if(!plan)return NextResponse.json({error:'Escolha um plano válido.'},{status:400});
  if(typeof name!=='string'||!name.trim()||name.length>200||typeof email!=='string'||!email.trim()||email.length>320||!/^\S+@\S+\.\S+$/.test(email.trim())||(phone!=null&&(typeof phone!=='string'||phone.length>40)))return NextResponse.json({error:'Informe nome e e-mail válidos.'},{status:400});
  if(typeof businessId!=='string'||!uuid.test(businessId)||typeof leadId!=='string'||!uuid.test(leadId))return NextResponse.json({error:'Faça o diagnóstico antes de iniciar a assinatura.'},{status:409});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)return NextResponse.json({error:'Pagamento ainda não configurado.'},{status:503});
  ensureAsaasConfigured();
  admin=createClient(url,key,{auth:{persistSession:false},global:{fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(10000)})}});
  const reservation=await admin.rpc('reserve_plan_checkout',{p_business_id:businessId,p_lead_id:leadId,p_name:name.trim(),p_email:email.trim().toLowerCase(),p_phone:phone?.trim()||null,p_plan_id:plan.id});
  if(reservation.error){if(String(reservation.error.message).includes('payment_plan_not_released'))return NextResponse.json({error:'Este plano está em preparação. A contratação ainda não foi liberada.'},{status:503});if(String(reservation.error.message).includes('payment_checkout_plan_conflict'))return NextResponse.json({error:'Já existe uma solicitação para outro plano. Confira o pagamento existente antes de trocar.'},{status:409});const mismatch=String(reservation.error.message).includes('payment_checkout_customer_conflict');return NextResponse.json({error:mismatch?'Os dados do diagnóstico não correspondem a esta ativação.':'Não foi possível reservar o pagamento. Tente novamente.'},{status:mismatch?409:503})}
  intent=reservation.data;
  if(intent?.state==='ready'&&intent.checkoutUrl&&intent.planId===plan.id&&intent.amountCents===plan.amountCents&&intent.cycle==='MONTHLY')return NextResponse.json({checkoutUrl:intent.checkoutUrl});
  if(intent?.state==='active')return NextResponse.json({error:'Este negócio já possui uma assinatura ativa.'},{status:409});
  if(intent?.state==='existing_contract')return NextResponse.json({error:'Este negócio já possui uma assinatura. Confira o pagamento existente antes de contratar novamente.'},{status:409});
  if(intent?.state==='payment_processing')return NextResponse.json({error:'Seu pagamento está em processamento. Aguarde a liberação do acesso.'},{status:409});
  if(intent?.state!=='create'||!intent.reference||!intent.checkoutId||!intent.lease)return NextResponse.json({error:'Uma solicitação de pagamento já está sendo conferida. Aguarde; não é necessário contratar novamente.'},{status:409});
  if(intent.planId!==plan.id||intent.amountCents!==plan.amountCents||intent.cycle!=='MONTHLY')throw Error('payment_checkout_plan_conflict');
  const appUrl=(process.env.NEXT_PUBLIC_APP_URL||'https://meulocal.ia.br').replace(/\/$/,'');
  const checkout=await createRecurringCheckout({externalReference:intent.reference,name:'MeuLocal '+plan.name,description:'Assinatura mensal MeuLocal '+plan.name,valueBRL:intent.amountCents/100,
   successUrl:`${appUrl}/contratar?payment=processing&plan=${plan.id}`,cancelUrl:`${appUrl}/contratar?payment=canceled&plan=${plan.id}`,expiredUrl:`${appUrl}/contratar?payment=expired&plan=${plan.id}`,
   customerData:{name:name.trim(),email:email.trim(),phone:phone?.trim()||undefined}});
  const saved=await admin.rpc('finish_payment_checkout',{p_checkout_id:intent.checkoutId,p_lease:intent.lease,p_provider_id:checkout.id});
  if(saved.error||!saved.data?.checkoutUrl)throw Error('checkout_result_not_saved');
  return NextResponse.json({checkoutUrl:saved.data.checkoutUrl});
 }catch{
  if(admin&&intent?.state==='create')try{await admin.rpc('defer_checkout_creation',{p_checkout_id:intent.checkoutId,p_lease:intent.lease})}catch{/* The reserved intent still prevents a duplicate provider request. */}
  return NextResponse.json({error:intent?.state==='create'?'A solicitação foi registrada e precisa ser conferida. Não é necessário contratar novamente.':'Não foi possível iniciar o pagamento. Confira a configuração e tente novamente.'},{status:503});
 }
}
