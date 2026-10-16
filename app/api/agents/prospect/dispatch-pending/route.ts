import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {z} from 'zod';
import {isAdminRequest} from '@/lib/admin-auth';
import {initialAcquisitionMessage} from '@/lib/acquisition/message';
import {deliverAcquisitionMessage} from '@/lib/acquisition/delivery';
export const maxDuration=60;
function dbClient(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;return url&&key?createClient(url,key,{auth:{persistSession:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(5000)})}}):null}
const unavailable=()=>NextResponse.json({error:'Não foi possível consultar a operação. Tente novamente.'},{status:503});
const schema=z.object({diagnosticIds:z.array(z.string().uuid()).length(1),confirmed:z.literal(true)});
function disabled(){return NextResponse.json({status:'outreach_disabled',contactStarted:false,processed:0,error:'Envios desativados.'},{status:423})}
export async function GET(req:Request){
 const secret=process.env.CRON_SECRET;
 if(!secret||req.headers.get('authorization')!=='Bearer '+secret)return NextResponse.json({error:'Não autorizado.'},{status:401});
 if(process.env.MEULOCAL_PROSPECT_INITIAL_OUTREACH_ENABLED!=='true')return disabled();
 return NextResponse.json({status:'confirmation_required',error:'O contato inicial exige seleção e confirmação administrativa.'},{status:423});
}
export async function POST(req:Request){
 if(!await isAdminRequest(req))return NextResponse.json({error:'Não autorizado.'},{status:401});
 if(process.env.MEULOCAL_PROSPECT_INITIAL_OUTREACH_ENABLED!=='true')return disabled();
 const parsed=schema.safeParse(await req.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:'Selecione uma empresa e confirme o contato inicial.'},{status:400});
 try{
  const db=dbClient();if(!db)return unavailable();
  const diagnostic=await db.from('prospect_diagnostics').select('id,public_token,business_name').eq('id',parsed.data.diagnosticIds[0]).maybeSingle();
  const lead=await db.from('leads').select('id,email,whatsapp,consent_email,consent_whatsapp').eq('prospect_diagnostic_id',parsed.data.diagnosticIds[0]).maybeSingle();
  if(diagnostic.error||lead.error)return unavailable();
  if(!diagnostic.data||!lead.data)return NextResponse.json({error:'Diagnóstico e lead devem estar vinculados sem ambiguidade.'},{status:409});
  const l=lead.data,d=diagnostic.data,channel=l.email&&l.consent_email?'email':l.whatsapp&&l.consent_whatsapp?'whatsapp':null;
  if(!channel)return NextResponse.json({error:'Não há canal autorizado para este lead.'},{status:409});
  const message=initialAcquisitionMessage(d.business_name,d.public_token);
  const result=await deliverAcquisitionMessage(db,{leadId:l.id,kind:'initial',step:1,channel,message,subject:'Análise inicial de '+d.business_name});
  return NextResponse.json({...result,contactStarted:result.processed},{status:result.ok&&!('stopped' in result)?200:409,headers:{'Cache-Control':'private, no-store'}});
 }catch{return unavailable()}
}
