import {NextResponse} from 'next/server';
import {customerContext,requireActiveAccount} from '@/lib/customer-context';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
 try{
  const c=await customerContext(req);
  if(!c)return json({error:'Não autorizado.'},401);
  if(!requireActiveAccount(c.account))return json({error:'Assinatura ativa necessária.'},403);
  const bid=c.account!.business_id;
  const [runs,alerts]=await Promise.all([
   c.admin.from('review_monitor_runs').select('last_success_at,last_attempt_at,error_code').eq('business_id',bid).maybeSingle(),
   c.admin.from('review_monitor_alerts').select('id,rating,verdict,state,first_seen_at,review_published_at,deadline_at,accepted_at,delivered_at,error_code').eq('business_id',bid).neq('state','ignored').order('first_seen_at',{ascending:false}).limit(20)
  ]);
  if(runs.error||alerts.error)throw Error('read_failed');
  const last=runs.data?.last_success_at;
  return json({enabled:process.env.MEULOCAL_REVIEW_MONITOR_ENABLED==='true',lastScan:last||null,stale:!last||Date.now()-Date.parse(last)>2*3600000,recipient:c.user.email,alerts:alerts.data});
 }catch{return json({error:'Não foi possível conferir o monitoramento. Não há confirmação de operação.'},503)}
}
