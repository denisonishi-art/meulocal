import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {isAdminRequest} from '@/lib/admin-auth';
import {appCaller,queueDate} from '@/lib/acquisition/daily-queue';
import {runDailyQueue} from '@/lib/acquisition/daily-queue-runner';
export const runtime='nodejs';
export const maxDuration=300;
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
function client(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;return url&&key?createClient(url,key,{auth:{persistSession:false}}):null}
/** Fila do dia (somente leitura): empresas prontas, sem as que já tiveram contato manual. */
export async function GET(req:Request){
 if(!await isAdminRequest(req))return json({error:'Não autorizado.'},401);
 const db=client();if(!db)return json({error:'Operação indisponível.'},503);
 const date=queueDate();
 const [run,items]=await Promise.all([
  db.from('prospect_daily_runs').select('queue_date,niche,region,status,ready_count,last_error').eq('queue_date',date).maybeSingle(),
  db.from('prospect_daily_queue').select('place_id,name,address,website,rating,reviews,score,email,message').eq('queue_date',date).eq('status','ready').order('score',{ascending:true,nullsFirst:false}).order('id',{ascending:true}).limit(20)
 ]);
 if(run.error||items.error)return json({error:'Não foi possível consultar a fila.'},503);
 const ids=(items.data||[]).map((i:any)=>i.place_id);
 const contacted=ids.length?await db.from('manual_prospect_permissions').select('place_id').in('place_id',ids):{data:[],error:null};
 if(contacted.error)return json({error:'Não foi possível consultar a fila.'},503);
 const done=new Set((contacted.data||[]).map((c:any)=>c.place_id));
 const priority=(score:number|null)=>score===null?'dados_insuficientes':score<35?'muito_alta':score<55?'alta':score<70?'media':'baixa';
 return json({date,run:run.data||null,items:(items.data||[]).filter((i:any)=>!done.has(i.place_id)).map((i:any)=>({...i,priority:priority(i.score)}))});
}
/** Retoma a preparação da fila de hoje sob demanda (mesma lógica do agendamento; não envia nada). */
export async function POST(req:Request){
 if(!await isAdminRequest(req))return json({error:'Não autorizado.'},401);
 if(process.env.MEULOCAL_DAILY_QUEUE_ENABLED!=='true')return json({status:'daily_queue_disabled'},423);
 const db=client();if(!db)return json({error:'Operação indisponível.'},503);
 try{return json(await runDailyQueue({db,call:await appCaller()}))}catch{return json({error:'Fila diária indisponível.'},503)}
}
