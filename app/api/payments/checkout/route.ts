import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {createRecurringCheckout} from '@/lib/payments/asaas';
import {meulocalBusinessRules} from '@/lib/agents/business-rules';
import {consumeRateLimit} from '@/lib/rate-limit';

export async function POST(req:Request){
  const rate=await consumeRateLimit(req,'payment_checkout',5,60);
  if(!rate.allowed)return NextResponse.json({error:'Muitas tentativas de ativação. Aguarde um minuto e tente novamente.'},{status:429,headers:{'Retry-After':'60'}});
  try{
    const {name,email,phone,businessId,leadId}=await req.json() as {name?:string;email?:string;phone?:string;businessId?:string;leadId?:string};
    if(!name?.trim()||!email?.trim())return NextResponse.json({error:'Informe nome e e-mail.'},{status:400});
    if(!businessId||!leadId)return NextResponse.json({error:'Faça o diagnóstico antes de iniciar a assinatura.'},{status:409});

    const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(!supabaseUrl||!serviceKey)return NextResponse.json({error:'Pagamento ainda não configurado.'},{status:503});
    const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}});
    const {data:lead}=await admin.from('leads').select('id,business_id,email').eq('id',leadId).eq('business_id',businessId).maybeSingle();
    if(!lead||String(lead.email||'').toLowerCase()!==email.trim().toLowerCase())return NextResponse.json({error:'Os dados do diagnóstico não correspondem a esta ativação.'},{status:409});
    const {data:existingAccount}=await admin.from('customer_accounts').select('id,payment_status').eq('business_id',businessId).maybeSingle();
    if(existingAccount?.payment_status==='active')return NextResponse.json({error:'Este negócio já possui uma assinatura ativa.'},{status:409});

    const appUrl=(process.env.NEXT_PUBLIC_APP_URL||'https://meulocal.ia.br').replace(/\/$/,'');
    const externalReference=crypto.randomUUID();
    const amountBRL=meulocalBusinessRules.commercial.officialMonthlyPriceBRL;

    const checkout=await createRecurringCheckout({
      externalReference,name:'MeuLocal',description:'Plano mensal MeuLocal',valueBRL:amountBRL,
      successUrl:`${appUrl}/contratar?payment=processing`,cancelUrl:`${appUrl}/contratar?payment=canceled`,expiredUrl:`${appUrl}/contratar?payment=expired`,
      customerData:{name:name.trim(),email:email.trim(),phone:phone?.trim()||undefined},
    });

    const {data:customerAccount,error:accountError}=await admin.from('customer_accounts').upsert({business_id:businessId,onboarding_status:'pending',payment_status:'pending',payment_provider:'asaas'},{onConflict:'business_id'}).select('id').single();
    if(accountError)throw accountError;
    const {error}=await admin.from('payment_checkouts').insert({
      provider:'asaas',external_checkout_id:checkout.id,external_reference:externalReference,business_id:businessId,lead_id:leadId,customer_account_id:customerAccount.id,
      amount_cents:Math.round(amountBRL*100),currency:'BRL',billing_type:'CREDIT_CARD_OR_PIX',cycle:'MONTHLY',status:'created',checkout_url:checkout.url,
      customer_name:name.trim(),customer_email:email.trim().toLowerCase(),customer_phone:phone?.trim()||null,
    });
    if(error)throw error;

    return NextResponse.json({checkoutUrl:checkout.url});
  }catch(err:any){
    return NextResponse.json({error:err?.message||'Não foi possível iniciar o pagamento.'},{status:500});
  }
}
