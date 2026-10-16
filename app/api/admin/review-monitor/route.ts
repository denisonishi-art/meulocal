import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {isAdminRequest} from '@/lib/admin-auth';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
 if(!await isAdminRequest(request))return json({error:'Não autorizado.'},401);
 if(!process.env.NEXT_PUBLIC_SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)return json({error:'Monitoramento indisponível.'},503);
 try{
  const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
  const [health,runs,alerts]=await Promise.all([
   db.rpc('review_monitor_health'),
   db.from('review_monitor_runs').select('business_id,last_success_at,last_attempt_at,error_code').order('last_success_at',{ascending:true,nullsFirst:true}).limit(50),
   db.from('review_monitor_alerts').select('id,business_id,state,first_seen_at,deadline_at,error_code').in('state',['pending','uncertain','failed','accepted']).order('first_seen_at').limit(50)
  ]);
  if(health.error||runs.error||alerts.error)throw Error();
  return json({enabled:process.env.MEULOCAL_REVIEW_MONITOR_ENABLED==='true',health:health.data,runs:runs.data,alerts:alerts.data});
 }catch{return json({error:'Não foi possível conferir os alertas e prazos.'},503)}
}
