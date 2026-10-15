import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {isAdminRequest} from '@/lib/admin-auth';
import {readOpenDotsGuidance} from '@/lib/agents/opendots-guidance';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers});
export async function GET(req:Request){
 if(!await isAdminRequest(req))return json({error:'Não autorizado.'},401);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return json({error:'Supervisão indisponível.'},503);
 try{
  const db=createClient(url,key,{auth:{persistSession:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(5000)})}});
  const columns='event_id,kind,business_id,state,attempts,receipt,created_at,updated_at';
  const [pending,completed]=await Promise.all([
   db.from('opendots_handoffs').select(columns,{count:'exact'}).in('state',['pending','processing']).order('created_at',{ascending:true}).order('event_id').limit(20),
   db.from('opendots_handoffs').select(columns,{count:'exact'}).eq('state','completed').order('updated_at',{ascending:false}).order('event_id').limit(20)
  ]);
  if([pending,completed].some(result=>result.error||result.count===null||!Array.isArray(result.data)))return json({error:'Não foi possível consultar a supervisão. Tente novamente.'},503);
  const section=(result:typeof pending)=>({count:result.count,rows:(result.data||[]).map(row=>{
   const receipt=row.receipt;
   const saved=receipt?.status==='decision_saved'&&receipt.eventId===row.event_id&&receipt.dispatched===0&&['answer','follow_up','handoff','stop'].includes(receipt.action);
   return {eventId:row.event_id,kind:row.kind,businessId:row.business_id,state:row.state,attempts:row.attempts,createdAt:row.created_at,updatedAt:row.updated_at,guidance:saved?readOpenDotsGuidance(receipt.guidance):null};
  })});
  return json({pending:section(pending),completed:section(completed)});
 }catch{return json({error:'Não foi possível consultar a supervisão. Tente novamente.'},503)}
}
