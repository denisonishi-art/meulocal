import {timingSafeEqual} from 'crypto';
import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';

function safeEqual(a:string,b:string){
  const aa=Buffer.from(a); const bb=Buffer.from(b);
  return aa.length===bb.length && timingSafeEqual(aa,bb);
}

export async function POST(req:Request){
  const expected=process.env.ASAAS_WEBHOOK_TOKEN;
  const received=req.headers.get('asaas-access-token')||'';
  if(!expected||!received||!safeEqual(received,expected))return NextResponse.json({error:'unauthorized'},{status:401});

  const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!supabaseUrl||!serviceKey)return NextResponse.json({error:'server_not_configured'},{status:503});

  try{
    const payload=await req.json() as Record<string,any>;
    const eventId=String(payload.id||'');
    const eventType=String(payload.event||'');
    if(!eventId||!eventType)return NextResponse.json({error:'invalid_event'},{status:400});

    const checkout=payload.checkout||{};
    const subscription=payload.subscription||{};
    const payment=payload.payment||{};
    const externalCheckoutId=checkout.id||null;
    const externalSubscriptionId=subscription.id||payment.subscription||null;
    const externalPaymentId=payment.id||null;
    const externalReference=checkout.externalReference||subscription.externalReference||payment.externalReference||null;

    const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}});
    const {error:insertError}=await admin.from('payment_events').insert({
      provider:'asaas',
      external_event_id:eventId,
      event_type:eventType,
      external_checkout_id:externalCheckoutId,
      external_subscription_id:externalSubscriptionId,
      external_payment_id:externalPaymentId,
      external_reference:externalReference,
      payload,
      processed_at:new Date().toISOString(),
    });

    if(insertError){
      if(insertError.code==='23505')return NextResponse.json({ok:true,duplicate:true});
      throw insertError;
    }

    let query=admin.from('payment_checkouts').select('id,customer_account_id').limit(1);
    if(externalReference)query=query.eq('external_reference',externalReference);
    else if(externalCheckoutId)query=query.eq('external_checkout_id',externalCheckoutId);
    else if(externalSubscriptionId)query=query.eq('external_subscription_id',externalSubscriptionId);
    else return NextResponse.json({ok:true,stored:true,matched:false});

    const {data:rows}=await query;
    const checkoutRecord=rows?.[0];
    if(!checkoutRecord)return NextResponse.json({ok:true,stored:true,matched:false});

    if(eventType==='CHECKOUT_PAID'||eventType==='PAYMENT_CONFIRMED'||eventType==='PAYMENT_RECEIVED'){
      await admin.from('payment_checkouts').update({status:'paid',paid_at:new Date().toISOString(),...(externalSubscriptionId?{external_subscription_id:externalSubscriptionId}:{})}).eq('id',checkoutRecord.id);
      if(checkoutRecord.customer_account_id){
        await admin.from('customer_accounts').update({payment_provider:'asaas',payment_status:'active',paid_at:new Date().toISOString(),...(externalSubscriptionId?{external_subscription_id:externalSubscriptionId}:{})}).eq('id',checkoutRecord.customer_account_id);
      }
    } else if(eventType==='CHECKOUT_CANCELED'||eventType==='SUBSCRIPTION_INACTIVATED'||eventType==='SUBSCRIPTION_DELETED'){
      await admin.from('payment_checkouts').update({status:'canceled'}).eq('id',checkoutRecord.id);
      if(checkoutRecord.customer_account_id)await admin.from('customer_accounts').update({payment_status:'canceled'}).eq('id',checkoutRecord.customer_account_id);
    } else if(eventType==='CHECKOUT_EXPIRED'){
      await admin.from('payment_checkouts').update({status:'expired'}).eq('id',checkoutRecord.id);
    } else if(eventType==='PAYMENT_OVERDUE'){
      if(checkoutRecord.customer_account_id)await admin.from('customer_accounts').update({payment_status:'past_due'}).eq('id',checkoutRecord.customer_account_id);
    } else if(eventType==='SUBSCRIPTION_CREATED'&&externalSubscriptionId){
      await admin.from('payment_checkouts').update({external_subscription_id:externalSubscriptionId}).eq('id',checkoutRecord.id);
      if(checkoutRecord.customer_account_id)await admin.from('customer_accounts').update({payment_provider:'asaas',external_subscription_id:externalSubscriptionId}).eq('id',checkoutRecord.customer_account_id);
    }

    return NextResponse.json({ok:true});
  }catch{
    return NextResponse.json({error:'webhook_processing_failed'},{status:500});
  }
}
