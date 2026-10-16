import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {z} from 'zod';
import {isAdminRequest} from '@/lib/admin-auth';
import {deliverAcquisitionMessage} from '@/lib/acquisition/delivery';
export const maxDuration=60;
function dbClient(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;return url&&key?createClient(url,key,{auth:{persistSession:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(5000)})}}):null}
const unavailable=()=>NextResponse.json({error:'Não foi possível consultar a operação. Tente novamente.'},{status:503});
const disabled=()=>NextResponse.json({status:'outreach_disabled',contactStarted:false,processed:0,error:'Envios desativados.'},{status:423});
const schema=z.object({leadId:z.string().uuid(),requestId:z.string().uuid(),name:z.string().min(2).max(240),email:z.string().email().max(250),message:z.string().min(50).max(1800),confirmed:z.literal(true)});
export async function POST(req:Request){
 if(!await isAdminRequest(req))return NextResponse.json({error:'Não autorizado.'},{status:401});
 if(process.env.MEULOCAL_MANUAL_OUTREACH_ENABLED!=='true')return disabled();
 const parsed=schema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:'Confira o vínculo, destinatário e confirmação do e-mail.'},{status:400});
 try{
  const db=dbClient();if(!db)return unavailable();
  const lead=await db.from('leads').select('id,name,email').eq('id',parsed.data.leadId).maybeSingle();
  if(lead.error)return unavailable();
  const l=lead.data;
  if(!l||String(l.email||'').trim().toLowerCase()!==parsed.data.email.trim().toLowerCase())return NextResponse.json({error:'O e-mail não corresponde ao lead persistido.'},{status:409});
  const normalize=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/gi,'').toLowerCase();
  if(normalize(l.name||'')!==normalize(parsed.data.name))return NextResponse.json({error:'O nome não corresponde ao lead persistido.'},{status:409});
  const result=await deliverAcquisitionMessage(db,{leadId:l.id,kind:'manual',step:null,requestId:parsed.data.requestId,channel:'email',message:parsed.data.message,subject:'Uma ideia para '+l.name});
  return NextResponse.json(result,{status:result.ok&&!('stopped' in result)?200:409,headers:{'Cache-Control':'private, no-store'}});
 }catch{return unavailable()}
}
