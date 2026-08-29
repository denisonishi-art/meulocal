import {NextResponse} from 'next/server';

const API='https://services.leadconnectorhq.com';

export async function POST(req:Request){
  try{
    const body=await req.json();
    const {businessId,name,phone,address,city,state,postalCode,website,country='BR',timezone='America/Sao_Paulo'}=body;
    if(!businessId||!name)return NextResponse.json({error:'Negócio inválido para provisionamento.'},{status:400});

    const plan=(process.env.GHL_PLAN_TIER||'starter').toLowerCase();
    const token=process.env.GHL_AGENCY_ACCESS_TOKEN;
    const companyId=process.env.GHL_COMPANY_ID;

    // HighLevel currently restricts automatic sub-account creation to Agency Pro.
    if(plan!=='pro'){
      return NextResponse.json({
        ok:true,
        mode:'manual_required',
        customerBlocked:false,
        status:'queued_for_manual_provisioning',
        businessId,
        reason:'automatic_subaccount_creation_requires_agency_pro',
        next:'admin_create_subaccount_then_attach_location_id',
      });
    }

    if(!token||!companyId)return NextResponse.json({error:'Credenciais Agency do HighLevel não configuradas.'},{status:503});

    const response=await fetch(`${API}/locations/`,{
      method:'POST',
      headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Version:'2021-07-28'},
      body:JSON.stringify({name,phone,companyId,address,city,state,country,postalCode,website,timezone}),
      cache:'no-store',
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)return NextResponse.json({error:payload?.message||payload?.error||'Falha ao criar subconta no HighLevel.',details:payload},{status:response.status});

    return NextResponse.json({
      ok:true,
      mode:'automatic',
      customerBlocked:false,
      businessId,
      status:'provisioned',
      ghlLocationId:payload?.id||payload?.location?.id||null,
      location:payload,
    });
  }catch{return NextResponse.json({error:'Não foi possível provisionar a operação no HighLevel.'},{status:500})}
}
