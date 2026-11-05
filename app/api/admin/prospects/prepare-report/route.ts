import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {z} from 'zod';
import {isAdminRequest} from '@/lib/admin-auth';
import {prepareVerifiedComparison} from '@/lib/competitors/hermes-report-delivery';

export const runtime='nodejs';
export const maxDuration=60;
const schema=z.object({diagnosticId:z.string().uuid()}).strict();
const response=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export async function POST(req:Request){
 if(!await isAdminRequest(req))return response({error:'Não autorizado.'},401);
 const raw=await req.text().catch(()=>'');
 if(raw.length>500)return response({error:'Solicitação inválida.'},413);
 let body:any;try{body=schema.parse(JSON.parse(raw))}catch{return response({error:'Diagnóstico inválido.'},400)}
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return response({error:'Banco não configurado.'},503);
 const db=createClient(url,key,{auth:{persistSession:false}});
 const {data:diagnostic,error}=await db.from('prospect_diagnostics')
  .select('id,place_id,business_name,public_token,niche,status').eq('id',body.diagnosticId).maybeSingle();
 if(error)return response({error:'Não foi possível verificar o diagnóstico.'},503);
 if(!diagnostic||['closed','converted'].includes(diagnostic.status))return response({error:'Diagnóstico não elegível.'},409);
 try{
  const report=await prepareVerifiedComparison(db,diagnostic,{forceRefresh:true});
  return response({ok:true,report,status:'ready',dispatched:0,contactStarted:0});
 }catch(error){
  const cause=error instanceof Error?error.message:'';
  const incomplete=['no_reliable_local_competitors','google_business_data_incomplete','invalid_google_category'].includes(cause);
  return response({error:incomplete?'Dados insuficientes para comparar concorrentes válidos em até 5 km. Nenhum relatório foi enviado.':'Não foi possível preparar a análise agora. Nenhum contato foi enviado.'},incomplete?422:503);
 }
}
