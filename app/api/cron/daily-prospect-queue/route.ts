import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {timingSafeEqual} from 'node:crypto';
import {appCaller} from '@/lib/acquisition/daily-queue';
import {runDailyQueue} from '@/lib/acquisition/daily-queue-runner';
export const runtime='nodejs';
export const maxDuration=300;
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(req:Request){return run(req)}
export async function POST(req:Request){return run(req)}
/** Prepara a fila do dia (10 empresas com e-mail oficial validado e mensagem pronta).
 * Não envia nada. Desligada por padrão: exige MEULOCAL_DAILY_QUEUE_ENABLED=true. */
async function run(req:Request){
 const secret=process.env.CRON_SECRET,provided=Buffer.from(req.headers.get('authorization')||''),expected=Buffer.from('Bearer '+(secret||''));
 if(!secret||provided.length!==expected.length||!timingSafeEqual(provided,expected))return json({error:'Não autorizado.'},401);
 if(process.env.MEULOCAL_DAILY_QUEUE_ENABLED!=='true')return json({status:'daily_queue_disabled',processed:0});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return json({error:'Operação indisponível.'},503);
 const db=createClient(url,key,{auth:{persistSession:false}});
 try{return json(await runDailyQueue({db,call:await appCaller()}))}catch{return json({error:'Fila diária indisponível.'},503)}
}
