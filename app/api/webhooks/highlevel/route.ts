import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {createHash} from 'crypto';

function eventId(body:any){
  const explicit=body?.id||body?.eventId||body?.messageId||body?.message?.id;
  if(explicit)return String(explicit);
  return createHash('sha256').update(JSON.stringify({type:body?.type||body?.event,locationId:body?.locationId,contactId:body?.contactId,timestamp:body?.timestamp||body?.dateAdded||null,status:body?.status||null})).digest('hex');
}

function normalize(body:any){
  const type=String(body?.type||body?.event||'unknown');
  const direction=body?.direction||body?.message?.direction||null;
  const channel=body?.messageType||body?.channel||body?.message?.type||null;
  const status=body?.status||body?.message?.status||null;
  const optedOut=Boolean(body?.optedOut||body?.dnd||/opt.?out|unsubscribe|dnd/i.test(type));
  const conversion=Boolean(body?.conversion||/conversion|opportunity.*won|payment/i.test(type));
  return {
    external_event_id:eventId(body),event_type:type,ghl_location_id:body?.locationId||body?.location?.id||null,
    contact_id:body?.contactId||body?.contact?.id||null,conversation_id:body?.conversationId||body?.conversation?.id||null,
    message_id:body?.messageId||body?.message?.id||null,direction,channel,normalized_status:status,opted_out:optedOut,conversion,
    payload_meta:{hasMessage:Boolean(body?.message||body?.messageId),hasContact:Boolean(body?.contact||body?.contactId),source:'highlevel_webhook'}
  };
}

export async function POST(request:Request){
  const secret=process.env.GHL_WEBHOOK_SECRET;
  if(!secret)return NextResponse.json({error:'HighLevel webhook ainda não ativado.'},{status:503});
  if(request.headers.get('x-meulocal-webhook-token')!==secret)return NextResponse.json({error:'Não autorizado.'},{status:401});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)return NextResponse.json({error:'Supabase não configurado.'},{status:503});
  const body=await request.json().catch(()=>null);if(!body)return NextResponse.json({error:'Payload inválido.'},{status:400});
  const db=createClient(url,key);const row=normalize(body);
  const {error}=await db.from('ghl_events').insert(row);
  if(error&&error.code!=='23505')return NextResponse.json({error:'Falha ao registrar evento.'},{status:500});
  return NextResponse.json({ok:true,duplicate:error?.code==='23505',eventId:row.external_event_id});
}
