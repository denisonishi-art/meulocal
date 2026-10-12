import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAdminRequest } from '@/lib/admin-auth';
import { findOperationalConversation, getLocationAccessToken, getOperationalConversationMessages } from '@/lib/highlevel-operational';

/**
 * Read-only GHL reconciliation, small batches only.
 * Never returns message bodies, email addresses, phone numbers or access tokens.
 * No CRM writes, sends, enrollment updates or retries.
 */
export async function GET(req: Request) {
  if (!await isAdminRequest(req)) return NextResponse.json({error:'Não autorizado.'},{status:401});
  const base=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!base || !key) return NextResponse.json({error:'Banco não configurado.'},{status:503});
  const rawLimit=Number(new URL(req.url).searchParams.get('limit')||10);
  const sampleSize=Number.isInteger(rawLimit)&&rawLimit>=1?Math.min(rawLimit,30):10;
  const db=createClient(base,key,{auth:{persistSession:false}});
  const {data:leads,error}=await db.from('leads')
    .select('id,ghl_contact_id,ghl_location_id,last_reply_at')
    .not('ghl_contact_id','is',null)
    .order('created_at',{ascending:false}).limit(sampleSize);
  if(error) return NextResponse.json({error:'Não foi possível consultar leads.'},{status:502});
  let checked=0,conversationsFound=0,withInbound=0,withOutbound=0,errors=0;
  let missingLocation=0,tokenFailures=0,conversationFailures=0,messageFailures=0;
  const failureCodes:Record<string,number>={};
  const countFailure=(err:unknown)=>{const text=err instanceof Error?err.message:String(err);const match=text.match(/\b(400|401|403|404|405|408|409|422|429|500|502|503|504)\b/);const code=match?`http_${match[1]}`:'other';failureCodes[code]=(failureCodes[code]||0)+1;};
  const deliveryStatusCounts:Record<string,number>={delivered:0,read:0,sent:0,failed:0,pending:0,unknown:0};
  let outboundMessages=0,inboundMessages=0,conversationsAtMessageLimit=0;
  const byLocation=new Map<string,string>();
  for(const lead of leads||[]) {
    const locationId=String(lead.ghl_location_id||'');
    if(!locationId) {errors++;missingLocation++;continue;}
    try {
      let token=byLocation.get(locationId);
      if(!token){try{token=await getLocationAccessToken(locationId);byLocation.set(locationId,token);}catch(err){errors++;tokenFailures++;countFailure(err);continue;}}
      let id:string|null;
      try{id=await findOperationalConversation({token,locationId,contactId:lead.ghl_contact_id});}catch(err){errors++;conversationFailures++;countFailure(err);continue;}
      checked++;
      if(!id)continue;
      conversationsFound++;
      let messages:any[];
      try{messages=await getOperationalConversationMessages({token,conversationId:id,limit:50});}catch(err){errors++;messageFailures++;countFailure(err);continue;}
      if(messages.length>=50)conversationsAtMessageLimit++;
      if(messages.some((m:any)=>String(m?.direction||'').toLowerCase()==='inbound'))withInbound++;
      if(messages.some((m:any)=>String(m?.direction||'').toLowerCase()==='outbound'))withOutbound++;
      for(const message of messages){
        const direction=String(message?.direction||'').toLowerCase();
        if(direction==='inbound')inboundMessages++;
        if(direction!=='outbound')continue;
        outboundMessages++;
        const raw=String(message?.status||'').toLowerCase();
        const status=raw==='delivered'||raw==='read'||raw==='sent'||raw==='failed'||raw==='pending'?raw:'unknown';
        deliveryStatusCounts[status]++;
      }
    } catch {errors++;}
  }
  return NextResponse.json({
    status:'read_only_audit',
    sampleSize,sampled:(leads||[]).length,checked,conversationsFound,withInbound,withOutbound,errors,
    diagnostics:{missingLocation,tokenFailures,conversationFailures,messageFailures,failureCodes},
    messages:{outboundMessages,inboundMessages,deliveryStatusCounts,conversationsAtMessageLimit},
    note:'Status retornados pela API do GHL não comprovam, isoladamente, entrega pelo provedor. Máximo de 50 mensagens por conversa; resultados podem ser parciais.'
  },{headers:{'Cache-Control':'no-store'}});
}
