import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {isAdminRequest} from '@/lib/admin-auth';

function normalizeEmail(v:any){const s=String(v||'').trim().toLowerCase();return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)?s:null}
function normalizePhone(v:any){const d=String(v||'').replace(/\D/g,'');if(!d)return null;if(d.length<10||d.length>13)return null;return d.startsWith('55')?d:'55'+d}

export async function POST(req:Request){
  if(!await isAdminRequest(req))return NextResponse.json({error:'Não autorizado.'},{status:401});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)return NextResponse.json({error:'Banco não configurado.'},{status:503});
  try{
    const body=await req.json();
    const diagnosticId=String(body?.diagnosticId||'');
    const email=normalizeEmail(body?.email);
    const whatsapp=normalizePhone(body?.whatsapp);
    const allowWhatsApp=body?.allowWhatsApp===true;
    if(!diagnosticId)return NextResponse.json({error:'Diagnóstico inválido.'},{status:400});
    if(!email&&!whatsapp)return NextResponse.json({error:'Informe pelo menos e-mail ou WhatsApp.'},{status:400});
    if(whatsapp&&!email&&!allowWhatsApp)return NextResponse.json({error:'Para prospecção fria, WhatsApp exige autorização explícita do operador.'},{status:400});

    const db=createClient(url,key,{auth:{persistSession:false}});
    const {data:diag}=await db.from('prospect_diagnostics').select('*').eq('id',diagnosticId).maybeSingle();
    if(!diag)return NextResponse.json({error:'Diagnóstico não encontrado.'},{status:404});
    if(!['approved','contacted'].includes(diag.status))return NextResponse.json({error:'Este prospect não está elegível para a régua.'},{status:409});

    let business:any=null;
    if(diag.place_id){
      const existing=await db.from('businesses').select('*').eq('google_place_id',diag.place_id).maybeSingle();
      business=existing.data;
    }
    if(!business){
      const inserted=await db.from('businesses').insert({
        google_place_id:diag.place_id,name:diag.business_name,category:diag.niche||null,address:diag.address||null,
        google_rating:diag.rating,google_review_count:diag.review_count,source:'outbound',status:'qualified'
      }).select('*').single();
      if(inserted.error)throw inserted.error;
      business=inserted.data;
    }

    let lead:any=null;
    if(email){
      const existing=await db.from('leads').select('*').eq('business_id',business.id).ilike('email',email).maybeSingle();
      lead=existing.data;
    }
    if(!lead&&whatsapp){
      const existing=await db.from('leads').select('*').eq('business_id',business.id).eq('whatsapp',whatsapp).maybeSingle();
      lead=existing.data;
    }
    if(!lead){
      const inserted=await db.from('leads').insert({
        business_id:business.id,name:body?.name||diag.business_name,email,whatsapp,
        consent_email:false,consent_whatsapp:allowWhatsApp,origin:'outbound',
        lifecycle_stage:'mql',automation_track:'meulocal_acquisition',
        next_action_at:new Date().toISOString(),prospect_diagnostic_id:diag.id
      }).select('*').single();
      if(inserted.error)throw inserted.error;
      lead=inserted.data;
    }else{
      const updated=await db.from('leads').update({
        name:body?.name||lead.name||diag.business_name,
        email:email||lead.email,whatsapp:whatsapp||lead.whatsapp,
        consent_whatsapp:allowWhatsApp?true:lead.consent_whatsapp,
        lifecycle_stage:lead.lifecycle_stage==='lead'?'mql':lead.lifecycle_stage,
        automation_track:'meulocal_acquisition',
        next_action_at:lead.next_action_at||new Date().toISOString(),
        prospect_diagnostic_id:diag.id,updated_at:new Date().toISOString()
      }).eq('id',lead.id).select('*').single();
      if(updated.error)throw updated.error;
      lead=updated.data;
    }

    const existingEnrollment=await db.from('automation_enrollments').select('*').eq('lead_id',lead.id).eq('track','meulocal_acquisition').maybeSingle();
    let enrollment=existingEnrollment.data;
    if(!enrollment){
      const inserted=await db.from('automation_enrollments').insert({
        lead_id:lead.id,track:'meulocal_acquisition',status:'active',step:0,next_run_at:new Date().toISOString()
      }).select('*').single();
      if(inserted.error)throw inserted.error;
      enrollment=inserted.data;
    }else if(enrollment.status!=='active'){
      const updated=await db.from('automation_enrollments').update({
        status:'active',step:0,next_run_at:new Date().toISOString(),completed_at:null
      }).eq('id',enrollment.id).select('*').single();
      if(updated.error)throw updated.error;
      enrollment=updated.data;
    }

    return NextResponse.json({
      ok:true,leadId:lead.id,enrollmentId:enrollment.id,status:'queued',
      firstChannel:email?'email':allowWhatsApp&&whatsapp?'whatsapp':'pending',
      diagnosticUrl:(process.env.NEXT_PUBLIC_APP_URL||new URL(req.url).origin)+'/d/'+diag.public_token
    });
  }catch(error:any){
    return NextResponse.json({error:error?.message||'Não foi possível iniciar a régua de aquisição.'},{status:500});
  }
}
