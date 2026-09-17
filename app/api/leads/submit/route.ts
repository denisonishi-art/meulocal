import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {consumeRateLimit} from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const rate=await consumeRateLimit(req,'lead_submit',8,60);
  if(!rate.allowed)return NextResponse.json({error:'Muitas tentativas em pouco tempo. Aguarde um minuto e tente novamente.'},{status:429,headers:{'Retry-After':'60'}});
  try {
    const payload = await req.json();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) return NextResponse.json({ error: 'Integração de leads não configurada.' }, { status: 500 });
    const admin=createClient(url,serviceKey,{auth:{persistSession:false}});
    const businessInput=payload?.business||{};const leadInput=payload?.lead||{};
    const placeId=String(businessInput.google_place_id||'').trim();const name=String(businessInput.name||'').trim();const email=String(leadInput.email||'').trim().toLowerCase();
    if(!placeId||!name||!email)return NextResponse.json({error:'Dados do diagnóstico incompletos.'},{status:400});
    const {data:business,error:businessError}=await admin.from('businesses').upsert({google_place_id:placeId,name,category:businessInput.category||null,address:businessInput.address||null,city:businessInput.city||null,phone:businessInput.phone||null,website:businessInput.website||null,google_rating:businessInput.google_rating||null,google_review_count:businessInput.google_review_count||null,source:'inbound',status:'diagnosed'},{onConflict:'google_place_id'}).select('id').single();
    if(businessError)throw businessError;
    const {data:lead,error:leadError}=await admin.from('leads').upsert({business_id:business.id,name:leadInput.name||null,email,whatsapp:leadInput.whatsapp||null,consent_email:Boolean(leadInput.consent_email),consent_whatsapp:Boolean(leadInput.consent_whatsapp),origin:'home'},{onConflict:'business_id,email'}).select('id').single();
    if(leadError)throw leadError;

    let businessId:string|null=null;let leadId:string|null=null;
    if(payload?.business?.google_place_id){
      const {data:business}=await admin.from('businesses').select('id').eq('google_place_id',payload.business.google_place_id).order('created_at',{ascending:false}).limit(1).maybeSingle();
      businessId=business?.id||null;
      if(businessId&&payload?.lead?.email){
        const {data:lead}=await admin.from('leads').select('id').eq('business_id',businessId).ilike('email',payload.lead.email).order('created_at',{ascending:false}).limit(1).maybeSingle();
        leadId=lead?.id||null;
      }
    }
    return NextResponse.json({ok:true,businessId,leadId});
  } catch {
    return NextResponse.json({ error: 'Não foi possível salvar seus dados agora.' }, { status: 500 });
  }
}
