import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';

async function ctx(req:Request){
  const auth=req.headers.get('authorization');
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL;
  const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!auth?.startsWith('Bearer ')||!url||!anon||!service)return null;
  const token=auth.slice(7);
  const client=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
  const {data:{user}}=await client.auth.getUser(token);
  if(!user)return null;
  const admin=createClient(url,service,{auth:{persistSession:false}});
  const {data:account}=await admin.from('customer_accounts')
    .select('id,business_id,onboarding_status,payment_provider,payment_status,external_subscription_id,paid_at,created_at,updated_at')
    .eq('user_id',user.id).maybeSingle();
  if(!account)return {user,admin,account:null};
  return {user,admin,account};
}

export async function GET(req:Request){
  const c=await ctx(req);
  if(!c)return NextResponse.json({error:'Não autorizado.'},{status:401});
  if(!c.account)return NextResponse.json({error:'Conta do cliente ainda não vinculada.'},{status:404});
  const bid=c.account.business_id;
  const [businessRes,leadsRes,automationsRes,outreachRes,paymentsRes,googleRes,ghlRes,contactsRes,reviewSettingsRes,reviewEnrollmentsRes,reviewEventsRes,importsRes]=await Promise.all([
    c.admin.from('businesses').select('id,name,category,address,city,phone,website,google_rating,google_review_count,status,ghl_allocation_status,created_at,updated_at').eq('id',bid).maybeSingle(),
    c.admin.from('leads').select('id,name,email,whatsapp,lifecycle_stage,automation_track,next_action_at,created_at,updated_at').eq('business_id',bid).order('created_at',{ascending:false}).limit(20),
    c.admin.from('automation_enrollments').select('id,lead_id,track,status,step,next_run_at,started_at,completed_at').order('started_at',{ascending:false}).limit(100),
    c.admin.from('outreach_events').select('id,lead_id,channel,event_type,provider,message_key,created_at').order('created_at',{ascending:false}).limit(200),
    c.admin.from('payment_checkouts').select('id,amount_cents,currency,billing_type,cycle,status,paid_at,activation_status,created_at,updated_at').eq('business_id',bid).order('created_at',{ascending:false}).limit(20),
    c.admin.from('google_business_connections').select('id,status,google_location_name,last_sync_at,last_sync_status,last_sync_error,connected_at,created_at').eq('business_id',bid).order('created_at',{ascending:false}).limit(1).maybeSingle(),
    c.admin.from('ghl_locations').select('id,ghl_location_id,name,allocation_mode,lifecycle_status,provisioned_at,created_at').eq('business_id',bid).order('created_at',{ascending:false}).limit(1).maybeSingle(),
    c.admin.from('customer_contacts').select('id,status,opt_out_at,created_at').eq('business_id',bid).limit(10000),
    c.admin.from('review_request_settings').select('status,day1_limit,day2_limit,steady_limit,weekdays_only,max_attempts,reminder_day_offsets,activated_at,paused_at').eq('business_id',bid).maybeSingle(),
    c.admin.from('review_request_enrollments').select('id,contact_id,status,activation_date,current_step,attempts,next_run_at,last_sent_at,completed_at,created_at').eq('business_id',bid).order('created_at',{ascending:false}).limit(10000),
    c.admin.from('review_request_events').select('id,enrollment_id,contact_id,channel,event_type,provider,created_at').eq('business_id',bid).order('created_at',{ascending:false}).limit(300),
    c.admin.from('customer_imports').select('id,file_name,status,total_rows,valid_rows,invalid_rows,duplicate_rows,created_at,confirmed_at').eq('business_id',bid).order('created_at',{ascending:false}).limit(20)
  ]);
  const leads=leadsRes.data||[]; const leadIds=leads.map((l:any)=>l.id); const leadSet=new Set(leadIds);
  const automations=(automationsRes.data||[]).filter((a:any)=>leadSet.has(a.lead_id));
  const outreach=(outreachRes.data||[]).filter((o:any)=>leadSet.has(o.lead_id));
  const leadById=new Map(leads.map((l:any)=>[l.id,l]));
  const requests=outreach.map((o:any)=>({...o,lead:leadById.get(o.lead_id)||null}));
  const reviewEnrollments=reviewEnrollmentsRes.data||[];
  const reviewEvents=reviewEventsRes.data||[];
  const activeAutomations=automations.filter((a:any)=>a.status==='active');
  const reviewAutomationActive=reviewSettingsRes.data?.status==='active'?1:0;
  const contacts=contactsRes.data||[];
  const sent=requests.filter((o:any)=>o.event_type==='sent'||o.event_type==='delivered').length+reviewEvents.filter((o:any)=>o.event_type==='sent'||o.event_type==='delivered').length;
  const replies=requests.filter((o:any)=>o.event_type==='replied').length+reviewEvents.filter((o:any)=>o.event_type==='replied').length;
  const failures=requests.filter((o:any)=>o.event_type==='failed').length+reviewEvents.filter((o:any)=>o.event_type==='failed').length;
  return NextResponse.json({
    user:{email:c.user.email},
    account:c.account,
    business:businessRes.data||null,
    google:googleRes.data||null,
    ghl:ghlRes.data||null,
    leads,
    automations,
    requests,
    payments:paymentsRes.data||[],
    reviewAutomation:{
      settings:reviewSettingsRes.data||null,
      enrollments:reviewEnrollments,
      events:reviewEvents,
      imports:importsRes.data||[],
      contacts:{total:contacts.length,eligible:contacts.filter((x:any)=>x.status==='eligible').length,queued:contacts.filter((x:any)=>x.status==='queued').length,active:contacts.filter((x:any)=>x.status==='active').length,completed:contacts.filter((x:any)=>x.status==='completed').length,optedOut:contacts.filter((x:any)=>x.status==='opted_out').length}
    },
    summary:{sent,replies,failures,activeAutomations:activeAutomations.length+reviewAutomationActive}
  });
}