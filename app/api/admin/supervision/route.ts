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
  const db=createClient(url,key,{auth:{persistSession:false},global:{fetch:(input,init)=>fetch(input,{...init,cache:'no-store',signal:AbortSignal.timeout(5000)})}});
  const columns='event_id,kind,business_id,state,attempts,receipt,created_at,updated_at';
  const [pending,completed,acquisition,reviews,payments,cadence]=await Promise.all([
   db.from('opendots_handoffs').select(columns,{count:'exact'}).in('state',['pending','processing']).order('created_at',{ascending:true}).order('event_id').limit(20),
   db.from('opendots_handoffs').select(columns,{count:'exact'}).eq('state','completed').order('updated_at',{ascending:false}).order('event_id').limit(20),
   db.from('outreach_events').select('id,lead_id,dispatch_state,dispatch_error,created_at',{count:'exact'}).in('dispatch_state',['reserved','dispatching','ambiguous']).order('created_at',{ascending:true}).limit(20),
   db.from('review_message_deliveries').select('id,business_id,state,error_code,created_at',{count:'exact'}).in('state',['reserved','dispatching','ambiguous']).order('created_at',{ascending:true}).limit(20),
   db.from('payment_events').select('id,activation_checkout_id,activation_state,activation_attempts,activation_error,created_at',{count:'exact'}).in('activation_state',['pending','processing']).in('event_type',['PAYMENT_CONFIRMED','PAYMENT_RECEIVED','CHECKOUT_PAID']).order('created_at',{ascending:true}).limit(20),
   db.from('automation_enrollments').select('id,lead_id,acquisition_issue,acquisition_retry_at,created_at:started_at',{count:'exact'}).eq('track','meulocal_acquisition').eq('status','active').not('acquisition_issue','is',null).order('acquisition_retry_at',{ascending:true}).limit(20)
  ]);
  console.info(JSON.stringify({stage:'admin_supervision_read',databaseHost:new URL(url).hostname,sources:[pending,completed,acquisition,reviews,payments,cadence].map(result=>({count:result.count,rows:result.data?.length,error:result.error?.code||null}))}));
  if([pending,completed,acquisition,reviews,payments,cadence].some(result=>result.error||result.count===null||!Array.isArray(result.data)))return json({error:'Não foi possível consultar a supervisão. Tente novamente.'},503);
  const section=(result:typeof pending)=>({count:result.count,rows:(result.data||[]).map(row=>{
   const receipt=row.receipt;
   const saved=receipt?.status==='decision_saved'&&receipt.eventId===row.event_id&&receipt.dispatched===0&&['answer','follow_up','handoff','stop'].includes(receipt.action);
   return {eventId:row.event_id,kind:row.kind,businessId:row.business_id,state:row.state,attempts:row.attempts,createdAt:row.created_at,updatedAt:row.updated_at,guidance:saved?readOpenDotsGuidance(receipt.guidance):null};
  })});
  const operational=(kind:string,result:any)=>({kind,count:result.count,rows:result.data.map((row:any)=>{
   const state=row.acquisition_issue?'blocked':row.dispatch_state||row.activation_state||row.state;
   const uncertain=state==='ambiguous'||state==='dispatching';
   return {id:row.id,businessId:row.business_id||null,leadId:row.lead_id||null,checkoutId:row.activation_checkout_id||null,state,attempts:row.activation_attempts??null,partial:!!(row.acquisition_issue||row.dispatch_error||row.error_code||row.activation_error),createdAt:row.created_at,
    nextStep:kind==='cadence'?'Cadência adiada por pelo menos cinco minutos. Conferir consentimento, vínculo, resposta, opt-out e tentativas incertas; não reenviar manualmente para contornar o bloqueio.':kind==='payment'?'Conferir o evento legítimo de pagamento e a retomada da ativação de acesso; não criar cobrança nem marcar como pago.':uncertain?'Conferir o provedor pelo ID da mensagem e salvar o recibo na reconciliação; não reenviar enquanto o resultado for incerto.':'Conferir permissões, resposta e opt-out. Retomar somente a mesma tentativa antes do transporte; envio continua sujeito à autorização.'};
  })});
  return json({pending:section(pending),completed:section(completed),operations:[operational('acquisition',acquisition),operational('reviews',reviews),operational('payment',payments),operational('cadence',cadence)]});
 }catch{return json({error:'Não foi possível consultar a supervisão. Tente novamente.'},503)}
}
