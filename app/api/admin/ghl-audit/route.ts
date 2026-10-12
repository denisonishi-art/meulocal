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
  const db=createClient(base,key,{auth:{persistSession:false}});
  const {data:leads,error}=await db.from('leads')
    .select('id,ghl_contact_id,ghl_location_id,last_reply_at')
    .not('ghl_contact_id','is',null)
    .order('created_at',{ascending:false}).limit(10);
  if(error) return NextResponse.json({error:'Não foi possível consultar leads.'},{status:502});
  let checked=0,conversationsFound=0,withInbound=0,withOutbound=0,errors=0;
  const byLocation=new Map<string,string>();
  for(const lead of leads||[]) {
    const locationId=String(lead.ghl_location_id||'');
    if(!locationId) {errors++;continue;}
    try {
      let token=byLocation.get(locationId);
      if(!token){token=await getLocationAccessToken(locationId);byLocation.set(locationId,token);}
      const id=await findOperationalConversation({token,locationId,contactId:lead.ghl_contact_id});
      checked++;
      if(!id)continue;
      conversationsFound++;
      const messages=await getOperationalConversationMessages({token,conversationId:id,limit:50});
      if(messages.some((m:any)=>String(m?.direction||'').toLowerCase()==='inbound'))withInbound++;
      if(messages.some((m:any)=>String(m?.direction||'').toLowerCase()==='outbound'))withOutbound++;
    } catch {errors++;}
  }
  return NextResponse.json({
    status:'read_only_audit',
    sampled:(leads||[]).length,checked,conversationsFound,withInbound,withOutbound,errors,
    note:'Amostra limitada; eventos no GHL não comprovam entrega sem status do provedor.'
  },{headers:{'Cache-Control':'no-store'}});
}
