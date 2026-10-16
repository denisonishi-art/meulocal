import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {z} from 'zod';
import {isAdminRequest} from '@/lib/admin-auth';
import {deliverAcquisitionMessage} from '@/lib/acquisition/delivery';
export const maxDuration=60;
function dbClient(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;return url&&key?createClient(url,key,{auth:{persistSession:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(5000)})}}):null}
const unavailable=()=>NextResponse.json({error:'Não foi possível consultar a operação. Tente novamente.'},{status:503});
const disabled=()=>NextResponse.json({status:'outreach_disabled',contactStarted:false,processed:0,error:'Envios desativados.'},{status:423});
const schema=z.object({leadId:z.string().uuid(),requestId:z.string().uuid(),channel:z.enum(['email','whatsapp']),message:z.string().trim().min(1).max(4000),confirmed:z.literal(true)});
export async function POST(req:Request){
 if(!await isAdminRequest(req))return NextResponse.json({error:'Não autorizado.'},{status:401});
 if(process.env.MEULOCAL_MANUAL_OUTREACH_ENABLED!=='true')return disabled();
 const parsed=schema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:'Confira o lead, canal e confirmação da resposta.'},{status:400});
 try{
  const db=dbClient();if(!db)return unavailable();
  const lead=await db.from('leads').select('id').eq('id',parsed.data.leadId).maybeSingle();
  if(lead.error)return unavailable();if(!lead.data)return NextResponse.json({error:'Lead não encontrado.'},{status:409});
  const result=await deliverAcquisitionMessage(db,{leadId:lead.data.id,kind:'manual',step:null,requestId:parsed.data.requestId,channel:parsed.data.channel,message:parsed.data.message,subject:'Re: sua análise inicial MeuLocal'});
  return NextResponse.json({...result,channel:parsed.data.channel},{status:result.ok&&!('stopped' in result)?200:409,headers:{'Cache-Control':'private, no-store'}});
 }catch{return unavailable()}
}
