import {timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {normalizeAsaasEvent} from '@/lib/payments/asaas-event';
import {acceptAsaasEvent} from '@/lib/payments/asaas-processing';
export const maxDuration=60;
export async function POST(request:Request){
 const expected=process.env.ASAAS_WEBHOOK_TOKEN,received=request.headers.get('asaas-access-token')||'';
 if(!expected||!received)return NextResponse.json({error:'unauthorized'},{status:401});
 const a=Buffer.from(expected),b=Buffer.from(received);
 if(a.length!==b.length||!timingSafeEqual(a,b))return NextResponse.json({error:'unauthorized'},{status:401});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return NextResponse.json({error:'server_not_configured'},{status:503});
 let event;
 try{const raw=await request.text();if(Buffer.byteLength(raw)>32768)return NextResponse.json({error:'payload_too_large'},{status:413});event=normalizeAsaasEvent(JSON.parse(raw))}
 catch{return NextResponse.json({error:'invalid_event'},{status:400})}
 try{
  const db=createClient(url,key,{auth:{persistSession:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(10000)})}});
  const {httpStatus,...result}=await acceptAsaasEvent(db,event);
  return NextResponse.json(result,{status:httpStatus});
 }catch{return NextResponse.json({error:'payment_processing_unavailable'},{status:503})}
}
