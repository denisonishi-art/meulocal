import {timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {fetchConnectedGoogleReviews} from '@/lib/google-reputation-sync';
import {monitorFetchedReviews,deliverNextReviewAlert} from '@/lib/reviews/monitoring-runtime';

export const maxDuration=60;
export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(request:Request){
 const expected=Buffer.from('Bearer '+(process.env.CRON_SECRET||'')),actual=Buffer.from(request.headers.get('authorization')||'');
 if(!process.env.CRON_SECRET||expected.length!==actual.length||!timingSafeEqual(expected,actual))return json({error:'Não autorizado.'},401);
 if(process.env.MEULOCAL_REVIEW_MONITOR_ENABLED!=='true')return json({enabled:false,processed:0});
 if(!process.env.NEXT_PUBLIC_SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)return json({error:'monitor_not_configured'},503);
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(5000)})}});
 let job:any;
 try{
  const alert=await deliverNextReviewAlert(db);
  const claim=await db.rpc('claim_review_monitor_connection');
  if(claim.error)throw Error('monitor_claim_failed');
  job=claim.data;
  let complete=true;
  if(job){
   const fetched=await fetchConnectedGoogleReviews(job);
   const monitored=await monitorFetchedReviews(db,job.business_id,fetched.reviews);
   complete=monitored?.complete===true&&!fetched.truncated;
   const saved=await db.from('review_monitor_runs').update({lease_until:null,last_success_at:complete?new Date().toISOString():job.previous_success_at,error_code:complete?null:'scan_incomplete'}).eq('business_id',job.business_id).eq('lease',job.lease).select('business_id').single();
   if(saved.error||!saved.data)throw Error('monitor_save_failed');
  }
  const health=await db.rpc('review_monitor_health');
  if(health.error)throw Error('monitor_health_failed');
  const ok=health.data?.overdue===0&&health.data?.uncertain===0&&health.data?.stale===0;
  console.info(JSON.stringify({stage:'review_monitor',ok,complete,health:health.data}));
  return json({ok,enabled:true,moreWork:Boolean(job)||Boolean(health.data?.pending),complete,alert,health:health.data},ok?200:503);
 }catch{
  if(job){await db.from('review_monitor_runs').update({lease_until:null,error_code:'scan_failed'}).eq('business_id',job.business_id).eq('lease',job.lease)}
  console.error(JSON.stringify({stage:'review_monitor',error:'scan_or_alert_failed'}));
  return json({ok:false,error:'scan_or_alert_failed'},503);
 }
}
