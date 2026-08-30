import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {isInternalOrAdminRequest} from '@/lib/internal-auth';

const API='https://services.leadconnectorhq.com';

export async function POST(req:Request){
  if(!await isInternalOrAdminRequest(req))return NextResponse.json({error:'Não autorizado.'},{status:401});
  try{
    const body=await req.json();
    const {businessId,name,phone,address,city,state,postalCode,website,country='BR',timezone='America/Sao_Paulo'}=body;
    if(!businessId||!name)return NextResponse.json({error:'Negócio inválido para provisionamento.'},{status:400});
    const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL,serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(!supabaseUrl||!serviceKey)return NextResponse.json({error:'Banco não configurado.'},{status:503});
    const db=createClient(supabaseUrl,serviceKey);
    const {data:workspace}=await db.from('ghl_workspaces').select('id,plan_tier').eq('active',true).eq('environment',process.env.VERCEL_ENV==='preview'?'preview':'production').limit(1).maybeSingle();
    const plan=(process.env.GHL_PLAN_TIER||workspace?.plan_tier||'unknown').toLowerCase();
    const token=process.env.GHL_AGENCY_ACCESS_TOKEN;
    const companyId=process.env.GHL_COMPANY_ID;

    const {data:job,error:jobError}=await db.from('ghl_provisioning_jobs').insert({business_id:businessId,workspace_id:workspace?.id||null,requested_mode:'dedicated',status:plan==='pro'&&token&&companyId?'running':'queued',started_at:plan==='pro'&&token&&companyId?new Date().toISOString():null,metadata:{requested_name:name,plan_tier:plan}}).select('id').single();
    if(jobError)return NextResponse.json({error:'Não foi possível registrar o provisionamento.'},{status:500});
    await db.from('businesses').update({ghl_allocation_status:plan==='pro'&&token&&companyId?'provisioning':'queued'}).eq('id',businessId);

    if(plan!=='pro'||!token||!companyId){
      return NextResponse.json({
        ok:true,mode:'manual_required',customerBlocked:false,status:'queued_for_manual_provisioning',businessId,jobId:job.id,
        reason:plan!=='pro'?'automatic_provisioning_not_enabled_for_current_plan':'agency_credentials_not_configured',
        next:'admin_create_subaccount_then_attach_location_id',
      });
    }

    const response=await fetch(`${API}/locations/`,{
      method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Version:'2021-07-28'},
      body:JSON.stringify({name,phone,companyId,address,city,state,country,postalCode,website,timezone}),cache:'no-store',
    });
    const payload=await response.json().catch(()=>({}));
    const locationId=payload?.id||payload?.location?.id||null;
    if(!response.ok||!locationId){
      const msg=payload?.message||payload?.error||'Falha ao criar subconta no HighLevel.';
      await db.from('ghl_provisioning_jobs').update({status:'failed',error_message:String(msg).slice(0,500),completed_at:new Date().toISOString()}).eq('id',job.id);
      await db.from('businesses').update({ghl_allocation_status:'error'}).eq('id',businessId);
      return NextResponse.json({error:msg},{status:response.status||502});
    }
    const {data:location,error:locationError}=await db.from('ghl_locations').upsert({workspace_id:workspace?.id||null,business_id:businessId,ghl_location_id:locationId,name,allocation_mode:'dedicated',lifecycle_status:'active',provisioned_at:new Date().toISOString(),metadata:{source:'api_provision'}},{onConflict:'ghl_location_id'}).select('id').single();
    if(locationError)throw locationError;
    await db.from('ghl_provisioning_jobs').update({status:'completed',external_location_id:locationId,completed_at:new Date().toISOString()}).eq('id',job.id);
    await db.from('businesses').update({ghl_location_ref:location.id,ghl_allocation_status:'active'}).eq('id',businessId);
    return NextResponse.json({ok:true,mode:'automatic',customerBlocked:false,businessId,jobId:job.id,status:'provisioned',ghlLocationId:locationId});
  }catch(error:any){return NextResponse.json({error:error?.message||'Não foi possível provisionar a operação no HighLevel.'},{status:500})}
}
