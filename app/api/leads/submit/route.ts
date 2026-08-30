import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {consumeRateLimit} from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const rate=await consumeRateLimit(req,'lead_submit',8,60);
  if(!rate.allowed)return NextResponse.json({error:'Muitas tentativas em pouco tempo. Aguarde um minuto e tente novamente.'},{status:429,headers:{'Retry-After':'60'}});
  try {
    const payload = await req.json();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !anonKey) return NextResponse.json({ error: 'Integração de leads não configurada.' }, { status: 500 });
    const supabase = createClient(url, anonKey, {auth:{persistSession:false,autoRefreshToken:false}});
    const { data, error } = await supabase.functions.invoke('submit-diagnostic', {body:payload});
    if (error) return NextResponse.json({ error: 'Não foi possível salvar seus dados.' }, { status: 502 });

    let businessId:string|null=null;let leadId:string|null=null;
    if(serviceKey&&payload?.business?.google_place_id){
      const admin=createClient(url,serviceKey,{auth:{persistSession:false}});
      const {data:business}=await admin.from('businesses').select('id').eq('google_place_id',payload.business.google_place_id).order('created_at',{ascending:false}).limit(1).maybeSingle();
      businessId=business?.id||null;
      if(businessId&&payload?.lead?.email){
        const {data:lead}=await admin.from('leads').select('id').eq('business_id',businessId).ilike('email',payload.lead.email).order('created_at',{ascending:false}).limit(1).maybeSingle();
        leadId=lead?.id||null;
      }
    }
    return NextResponse.json({...((data&&typeof data==='object')?data:{}),businessId,leadId});
  } catch {
    return NextResponse.json({ error: 'Não foi possível salvar seus dados agora.' }, { status: 500 });
  }
}
