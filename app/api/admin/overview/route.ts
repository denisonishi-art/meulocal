import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {isAdminRequest} from '@/lib/admin-auth';

function dbClient(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url&&key?createClient(url,key,{auth:{persistSession:false}}):null;
}
function recent<T>(rows:T[]|null|undefined){return rows||[]}

export async function GET(req:Request){
  if(!await isAdminRequest(req))return NextResponse.json({error:'Não autorizado.'},{status:401});
  const db=dbClient();
  if(!db)return NextResponse.json({error:'Banco não configurado.'},{status:503});

  const [
    businessesRes,leadsRes,diagnosticsRes,customersRes,automationsRes,
    outreachRes,paymentsRes,googleRes,ghlRes,ghlJobsRes,syncRes,reviewSettingsRes,reviewEnrollmentsRes,reviewEventsRes,contactsRes
  ]=await Promise.all([
    db.from('businesses').select('id,name,category,address,city,phone,website,google_rating,google_review_count,source,status,ghl_allocation_status,created_at,updated_at').order('created_at',{ascending:false}).limit(200),
    db.from('leads').select('id,business_id,name,email,whatsapp,lifecycle_stage,automation_track,next_action_at,prospect_diagnostic_id,created_at,updated_at').order('created_at',{ascending:false}).limit(200),
    db.from('prospect_diagnostics').select('id,public_token,place_id,business_name,address,rating,review_count,score,niche,region,status,approved_at,first_contact_at,diagnostic_opened_at,cta_clicked_at,converted_at,created_at').order('created_at',{ascending:false}).limit(200),
    db.from('customer_accounts').select('id,user_id,business_id,onboarding_status,payment_provider,payment_status,external_subscription_id,paid_at,created_at,updated_at').order('created_at',{ascending:false}).limit(200),
    db.from('automation_enrollments').select('id,lead_id,track,status,step,next_run_at,started_at,completed_at').order('started_at',{ascending:false}).limit(200),
    db.from('outreach_events').select('id,lead_id,channel,event_type,provider,message_key,metadata,created_at').order('created_at',{ascending:false}).limit(200),
    db.from('payment_checkouts').select('id,business_id,customer_account_id,lead_id,amount_cents,currency,billing_type,cycle,status,paid_at,activation_status,created_at').order('created_at',{ascending:false}).limit(200),
    db.from('google_business_connections').select('id,business_id,status,last_sync_at,last_sync_status,created_at').order('created_at',{ascending:false}).limit(200),
    db.from('ghl_locations').select('id,business_id,ghl_location_id,name,allocation_mode,lifecycle_status,is_internal,provisioned_at,created_at').order('created_at',{ascending:false}).limit(200),
    db.from('ghl_provisioning_jobs').select('id,business_id,status,requested_mode,error_message,requested_at,completed_at').order('requested_at',{ascending:false}).limit(100),
    db.from('google_sync_logs').select('id,business_id,status,source,review_count,score,error_code,created_at').order('created_at',{ascending:false}).limit(100),
    db.from('review_request_settings').select('business_id,status,day1_limit,day2_limit,steady_limit,weekdays_only,max_attempts,activated_at,paused_at,updated_at').order('updated_at',{ascending:false}).limit(200),
    db.from('review_request_enrollments').select('id,business_id,contact_id,status,activation_date,current_step,attempts,next_run_at,last_sent_at,completed_at,created_at').order('created_at',{ascending:false}).limit(1000),
    db.from('review_request_events').select('id,business_id,enrollment_id,contact_id,channel,event_type,created_at').order('created_at',{ascending:false}).limit(300),
    db.from('customer_contacts').select('id,business_id,status,opt_out_at,created_at').order('created_at',{ascending:false}).limit(5000)
  ]);

  const businesses=recent<any>(businessesRes.data), leads=recent<any>(leadsRes.data), diagnostics=recent<any>(diagnosticsRes.data);
  const customers=recent<any>(customersRes.data), automations=recent<any>(automationsRes.data), outreach=recent<any>(outreachRes.data);
  const payments=recent<any>(paymentsRes.data), google=recent<any>(googleRes.data), ghl=recent<any>(ghlRes.data);
  const ghlJobs=recent<any>(ghlJobsRes.data), syncLogs=recent<any>(syncRes.data);
  const reviewSettings=recent<any>(reviewSettingsRes.data), reviewEnrollments=recent<any>(reviewEnrollmentsRes.data), reviewEvents=recent<any>(reviewEventsRes.data), contacts=recent<any>(contactsRes.data);

  const businessById=new Map(businesses.map(x=>[x.id,x]));
  const leadById=new Map(leads.map(x=>[x.id,x]));
  const googleByBusiness=new Map(google.map(x=>[x.business_id,x]));
  const ghlByBusiness=new Map(ghl.map(x=>[x.business_id,x]));
  const paymentByBusiness=new Map(payments.map(x=>[x.business_id,x]));

  const leadRows=leads.map(l=>({...l,business:businessById.get(l.business_id)||null}));
  const customerRows=customers.map(c=>({
    ...c,business:businessById.get(c.business_id)||null,
    google:googleByBusiness.get(c.business_id)||null,
    ghl:ghlByBusiness.get(c.business_id)||null,
    payment:paymentByBusiness.get(c.business_id)||null
  }));
  const automationRows=automations.map(a=>{
    const lead=leadById.get(a.lead_id)||null;
    return {...a,lead,business:lead?businessById.get(lead.business_id)||null:null};
  });
  const diagnosticsRows=diagnostics.map(d=>{
    const diagnosticLeads=leads.filter(l=>l.prospect_diagnostic_id===d.id);
    const ids=new Set(diagnosticLeads.map(l=>l.id));
    const event=outreach.filter(e=>ids.has(e.lead_id)).sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime())[0]||null;
    const failed=event?.event_type==='failed';
    const channel=event?.channel==='whatsapp'?'WhatsApp':event?.channel==='email'?'E-mail':null;
    const reason=failed?(event.metadata?.reason||event.metadata?.error||'Falha ao iniciar a régua'):d.status==='approved'?'E-mail público não encontrado':null;
    return {...d,delivery:{
      state:failed?'error':d.status==='contacted'?'contacted':d.status==='converted'?'converted':'pending',
      channel:channel||(d.status==='contacted'?'E-mail':null),reason,
      at:event?.created_at||d.first_contact_at||null
    }};
  });
  const reviewAutomationRows=reviewSettings.map(s=>{
    const enrollments=reviewEnrollments.filter((x:any)=>x.business_id===s.business_id);
    const businessContacts=contacts.filter((x:any)=>x.business_id===s.business_id);
    return {
      id:'review-'+s.business_id,type:'review_requests',track:'Automação de avaliações',status:s.status,step:0,
      next_run_at:enrollments.filter((x:any)=>x.next_run_at).sort((a:any,b:any)=>new Date(a.next_run_at).getTime()-new Date(b.next_run_at).getTime())[0]?.next_run_at||null,
      started_at:s.activated_at,completed_at:null,business:businessById.get(s.business_id)||null,
      metrics:{contacts:businessContacts.length,queued:enrollments.filter((x:any)=>x.status==='queued').length,active:enrollments.filter((x:any)=>x.status==='active').length,completed:enrollments.filter((x:any)=>x.status==='completed').length,optedOut:businessContacts.filter((x:any)=>x.status==='opted_out').length}
    };
  });

  const kpis={
    leads:leads.length,
    conversations:leads.filter(x=>x.lifecycle_stage==='conversation'||x.lifecycle_stage==='mql').length,
    customers:customers.filter(x=>x.payment_status==='active').length,
    onboardingPending:customers.filter(x=>x.onboarding_status!=='completed').length,
    automationsActive:automations.filter(x=>x.status==='active').length+reviewSettings.filter(x=>x.status==='active').length,
    diagnosticsOpen:diagnostics.filter(x=>x.diagnostic_opened_at).length,
    diagnosticConversions:diagnostics.filter(x=>x.converted_at||x.status==='converted').length,
    paidCheckouts:payments.filter(x=>x.status==='paid'||x.paid_at).length
  };

  const activity=[
    ...outreach.slice(0,15).map(x=>({type:'outreach',at:x.created_at,title:`${x.event_type} · ${x.channel}`,detail:(leadById.get(x.lead_id)?.email)||'Lead'})),
    ...diagnostics.slice(0,15).map(x=>({type:'diagnostic',at:x.updated_at||x.created_at,title:`Diagnóstico · ${x.status}`,detail:x.business_name})),
    ...customers.slice(0,15).map(x=>({type:'customer',at:x.updated_at||x.created_at,title:`Cliente · ${x.payment_status}`,detail:businessById.get(x.business_id)?.name||'Empresa'})),
    ...reviewEvents.slice(0,15).map(x=>({type:'review_request',at:x.created_at,title:`Avaliações · ${x.event_type}`,detail:businessById.get(x.business_id)?.name||'Cliente'}))
  ].filter(x=>x.at).sort((a,b)=>new Date(b.at).getTime()-new Date(a.at).getTime()).slice(0,20);

  const agents=[
    {name:'Prospecção',status:'online',detail:`${diagnostics.length} diagnósticos no histórico`},
    {name:'Onboarding',status:kpis.onboardingPending?'attention':'online',detail:kpis.onboardingPending?`${kpis.onboardingPending} pendente(s)`:'Sem pendências'},
    {name:'GHL',status:ghlJobs.some(x=>x.status==='failed')?'attention':ghl.length?'online':'idle',detail:ghl.length?`${ghl.length} location(s) provisionada(s)`:'Aguardando clientes'},
    {name:'Google Business',status:syncLogs.some(x=>x.status==='failed')?'attention':google.length?'online':'idle',detail:google.length?`${google.length} conexão(ões)`:'Aguardando conexões'}
  ];

  return NextResponse.json({
    kpis,
    leads:leadRows,
    diagnostics:diagnosticsRows,
    customers:customerRows,
    automations:[...reviewAutomationRows,...automationRows],
    activity,
    agents,
    infrastructure:{ghlJobs:ghlJobs.slice(0,30),syncLogs:syncLogs.slice(0,30)}
  });
}
