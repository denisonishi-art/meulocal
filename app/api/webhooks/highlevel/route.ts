import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {verify as verifySignature} from 'crypto';
import {normalizeLocalInbound,persistLocalInbound} from '@/lib/meulocal-inbound';

const GHL_PUBLIC_KEY='-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAi2HR1srL4o18O8BRa7gVJY7G7bupbN3H9AwJrHCDiOg=\n-----END PUBLIC KEY-----';

function validWebhook(request:Request,raw:string){
  const signed=request.headers.get('x-ghl-signature');
  if(signed){
    try{return verifySignature(null,Buffer.from(raw,'utf8'),GHL_PUBLIC_KEY,Buffer.from(signed,'base64'))}catch{return false}
  }
  const secret=process.env.GHL_WEBHOOK_SECRET;
  return Boolean(secret&&request.headers.get('x-meulocal-webhook-token')===secret);
}

export async function POST(request:Request){
  const raw=await request.text();
  if(!validWebhook(request,raw))return NextResponse.json({error:'Não autorizado.'},{status:401});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)return NextResponse.json({error:'Supabase não configurado.'},{status:503});
  let body:any;try{body=JSON.parse(raw)}catch{return NextResponse.json({error:'Payload inválido.'},{status:400})}
  if(!body||typeof body!=='object'||Array.isArray(body))return NextResponse.json({error:'Payload inválido.'},{status:400});
  let event;try{event=normalizeLocalInbound(body,'highlevel_webhook')}catch{return NextResponse.json({error:'inbound_scope_unverified'},{status:400})}
  const db=createClient(url,key,{auth:{persistSession:false}});
  try{
    // A duplicate can represent unfinished legacy processing. The RPC decides atomically.
    // Reviews and acquisition are independent scoped domains inside the same transaction.
    const result=await persistLocalInbound(db,event);
    return NextResponse.json({ok:true,eventId:event.external_event_id,...result});
  }catch{return NextResponse.json({ok:false,error:'inbound_persistence_failed'},{status:503})}
}
