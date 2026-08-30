import {timingSafeEqual} from 'crypto';
import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';

function safeEqual(a:string,b:string){
  const aa=Buffer.from(a); const bb=Buffer.from(b);
  return aa.length===bb.length && timingSafeEqual(aa,bb);
}

async function ensureCustomerUser(admin:any,email:string,redirectTo:string){
  const invited=await admin.auth.admin.inviteUserByEmail(email,{redirectTo});
  if(!invited.error&&invited.data?.user)return {user:invited.data.user,status:'invited' as const};
  const listed=await admin.auth.admin.listUsers({page:1,perPage:1000});
  const existing=listed.data?.users?.find((u:any)=>String(u.email||'').toLowerCase()===email.toLowerCase());
  if(existing)return {user:existing,status:'linked' as const};
  throw invited.error||new Error('CUSTOMER_USER_CREATION_FAILED');
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
    const compactPayload={event:eventType,checkoutId:externalCheckoutId,subscriptionId:externalSubscriptionId,paymentId:externalPaymentId,externalReference,status:payment.status||subscription.status||checkout.status||null};
    const {error:insertError}=await admin.from('payment_events').insert({
      provider:'asaas',external_event_id:eventId,event_type:eventType,external_checkout_id:externalCheckoutId,
      external_subscription_id:externalSubscriptionId,external_payment_id:externalPaymentId,external_reference:externalReference,
      payload:compactPayload,processed_at:new Date().toISOString(),
    });

    if(insertError){
      if(insertError.code==='23505')return NextResponse.json({ok:true,duplicate:true});
      throw insertError;
    }

    let query=admin.from('payment_checkouts').select('id,customer_account_id,business_id,customer_email,activation_status').limit(1);
    if(externalReference)query=query.eq('external_reference',externalReference);
    else if(externalCheckoutId)query=query.eq('external_checkout_id',externalCheckoutId);
    else if(externalSubscriptionId)query=query.eq('external_subscription_id',externalSubscriptionId);
    else return NextResponse.json({ok:true,stored:true,matched:false});

    const {data:rows}=await query;
    const checkoutRecord=rows?.[0];
    if(!checkoutRecord)return NextResponse.json({ok:true,stored:true,matched:false});

    if(eventType==='CHECKOUT_PAID'||eventType==='PAYMENT_CONFIRMED'||eventType==='PAYMENT_RECEIVED'){
      const paidAt=new Date().toISOString();
      await admin.from('payment_checkouts').update({status:'paid',paid_at:paidAt,...(externalSubscriptionId?{external_subscription_id:externalSubscriptionId}:{})}).eq('id',checkoutRecord.id);
      if(checkoutRecord.customer_account_id){
        const {data:account}=await admin.from('customer_accounts').select('id,user_id').eq('id',checkoutRecord.customer_account_id).maybeSingle();
        let userId=account?.user_id||null;
        let activationStatus:'linked'|'invited'=userId?'linked':'invited';
        if(!userId&&checkoutRecord.customer_email){
          try{
            const appUrl=(process.env.NEXT_PUBLIC_APP_URL||'https://meulocal.ia.br').replace(/\/$/,'');
            const access=await ensureCustomerUser(admin,checkoutRecord.customer_email,`${appUrl}/login?reset=1`);
            userId=access.user.id;activationStatus=access.status;
          }catch(error:any){
            await admin.from('payment_checkouts').update({activation_status:'error',activation_error:String(error?.message||'access_activation_failed').slice(0,500)}).eq('id',checkoutRecord.id);
            return NextResponse.json({ok:true,paymentConfirmed:true,accessActivation:'error'});
          }
        }
        await admin.from('customer_accounts').update({user_id:userId,payment_provider:'asaas',payment_status:'active',paid_at:paidAt,...(externalSubscriptionId?{external_subscription_id:externalSubscriptionId}:{})}).eq('id',checkoutRecord.customer_account_id);
        await admin.from('payment_checkouts').update({activation_status:activationStatus,activation_error:null}).eq('id',checkoutRecord.id);
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
