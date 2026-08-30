import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {createRecurringCheckout} from '@/lib/payments/asaas';
import {meulocalBusinessRules} from '@/lib/agents/business-rules';

export async function POST(req:Request){
  try{
    const {name,email,phone}=await req.json() as {name?:string;email?:string;phone?:string};
    if(!name?.trim()||!email?.trim())return NextResponse.json({error:'Informe nome e e-mail.'},{status:400});

    const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(!supabaseUrl||!serviceKey)return NextResponse.json({error:'Pagamento ainda não configurado.'},{status:503});

    const appUrl=(process.env.NEXT_PUBLIC_APP_URL||'https://meulocal.ia.br').replace(/\/$/,'');
    const externalReference=crypto.randomUUID();
    const amountBRL=meulocalBusinessRules.commercial.officialMonthlyPriceBRL;

    const checkout=await createRecurringCheckout({
      externalReference,
      name:'MeuLocal',
      description:'Plano mensal MeuLocal',
      valueBRL:amountBRL,
      successUrl:`${appUrl}/contratar?payment=processing`,
      cancelUrl:`${appUrl}/contratar?payment=canceled`,
      expiredUrl:`${appUrl}/contratar?payment=expired`,
      customerData:{name:name.trim(),email:email.trim(),phone:phone?.trim()||undefined},
    });

    const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}});
    const {error}=await admin.from('payment_checkouts').insert({
      provider:'asaas',
      external_checkout_id:checkout.id,
      external_reference:externalReference,
      amount_cents:Math.round(amountBRL*100),
      currency:'BRL',
      billing_type:'CREDIT_CARD_OR_PIX',
      cycle:'MONTHLY',
      status:'created',
      checkout_url:checkout.url,
      customer_name:name.trim(),
      customer_email:email.trim().toLowerCase(),
      customer_phone:phone?.trim()||null,
    });
    if(error)throw error;

    return NextResponse.json({checkoutUrl:checkout.url});
  }catch(err:any){
    return NextResponse.json({error:err?.message||'Não foi possível iniciar o pagamento.'},{status:500});
  }
}
