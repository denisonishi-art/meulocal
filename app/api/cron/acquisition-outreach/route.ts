import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {deliverAcquisitionMessage} from '@/lib/acquisition/delivery';
export const maxDuration=60;
function dbClient(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;return url&&key?createClient(url,key,{auth:{persistSession:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(5000)})}}):null}
const unavailable=()=>NextResponse.json({error:'Não foi possível consultar a operação. Tente novamente.'},{status:503});
export async function GET(req:Request){return run(req)}
export async function POST(req:Request){return run(req)}
async function run(req:Request){
 const secret=process.env.CRON_SECRET;
 if(!secret||req.headers.get('authorization')!=='Bearer '+secret)return NextResponse.json({error:'Não autorizado.'},{status:401});
 if(process.env.MEULOCAL_ACQUISITION_OUTREACH_ENABLED!=='true')return NextResponse.json({status:'outreach_disabled',contactStarted:false,processed:0});
 try{
  const db=dbClient();if(!db)return unavailable();
  const due=await db.from('automation_enrollments').select('id,lead_id,step').eq('track','meulocal_acquisition').eq('status','active').lte('next_run_at',new Date().toISOString()).order('next_run_at',{ascending:true}).limit(1);
  if(due.error||!Array.isArray(due.data))return unavailable();
  if(!due.data.length)return NextResponse.json({ok:true,processed:0});
  const enrollment=due.data[0],step=enrollment.step+1;
  if(step!==2&&step!==3)return NextResponse.json({ok:false,processed:0,error:'legacy_cadence_reconciliation_required'},{status:409});
  const lead=await db.from('leads').select('id,email,whatsapp,consent_email,consent_whatsapp,prospect_diagnostic_id').eq('id',enrollment.lead_id).maybeSingle();
  if(lead.error)return unavailable();
  if(!lead.data)return NextResponse.json({ok:false,processed:0,error:'acquisition_lead_missing'},{status:409});
  const l=lead.data,diagnostic=await db.from('prospect_diagnostics').select('id,public_token,business_name').eq('id',l.prospect_diagnostic_id).maybeSingle();
  if(diagnostic.error)return unavailable();
  if(!diagnostic.data)return NextResponse.json({ok:false,processed:0,error:'acquisition_diagnostic_missing'},{status:409});
  const d=diagnostic.data,channel=l.email&&l.consent_email?'email':l.whatsapp&&l.consent_whatsapp?'whatsapp':null;
  if(!channel)return NextResponse.json({ok:false,processed:0,error:'acquisition_channel_not_authorized'},{status:409});
  const message=(step===2?'Olá! Passando para lembrar da análise inicial da ':'Olá! Este é nosso último lembrete sobre a análise inicial da ')+d.business_name+':\nhttps://meulocal.ia.br/d/'+d.public_token+'\n\nSe quiser conversar, responda por este canal. Para não receber novos contatos, responda SAIR.';
  const result=await deliverAcquisitionMessage(db,{leadId:l.id,kind:'cadence',step,channel,message,subject:step===2?'Você viu sua análise inicial?':'Último lembrete sobre sua análise inicial'});
  return NextResponse.json(result,{status:result.ok?200:409,headers:{'Cache-Control':'private, no-store'}});
 }catch{return unavailable()}
}
