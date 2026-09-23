import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {isAdminRequest} from '@/lib/admin-auth';
import {getLocationAccessToken,sendOperationalMessage} from '@/lib/highlevel-operational';

export async function POST(req:Request){
  if(!await isAdminRequest(req))return NextResponse.json({error:'Não autorizado.'},{status:401});
  const body=await req.json().catch(()=>null);const leadId=String(body?.leadId||''),message=String(body?.message||'').trim();
  if(!leadId||!message)return NextResponse.json({error:'Informe a resposta.'},{status:400});
  if(message.length>4000)return NextResponse.json({error:'A resposta é longa demais.'},{status:400});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)return NextResponse.json({error:'Banco não configurado.'},{status:503});
  const db=createClient(url,key,{auth:{persistSession:false}});
  const {data:lead}=await db.from('leads').select('id,email,whatsapp,ghl_contact_id,ghl_location_id,lifecycle_stage').eq('id',leadId).maybeSingle();
  if(!lead?.ghl_contact_id)return NextResponse.json({error:'Contato ainda não está vinculado ao envio.'},{status:409});
  const channel=body?.channel==='whatsapp'||(!lead.email&&lead.whatsapp)?'whatsapp':'email';
  if(channel==='email'&&!lead.email)return NextResponse.json({error:'Este lead não tem e-mail.'},{status:400});
  if(channel==='whatsapp'&&!lead.whatsapp)return NextResponse.json({error:'Este lead não tem WhatsApp.'},{status:400});
  try{
    const token=await getLocationAccessToken(lead.ghl_location_id||process.env.GHL_LOCATION_ID||'uNh3KsM7WFuLeTN8Q583');
    const sent=await sendOperationalMessage({token,contactId:lead.ghl_contact_id,channel,message,subject:channel==='email'?'Re: seu diagnóstico MeuLocal':undefined,email:lead.email});
    const now=new Date().toISOString();
    await db.from('outreach_events').insert({lead_id:lead.id,channel,event_type:'sent',provider:'highlevel',external_id:sent.messageId||null,conversation_id:sent.conversationId||null,message_key:'manual_reply',metadata:{source:'meulocal_admin',manual_reply:true}});
    await db.from('leads').update({lifecycle_stage:'conversation',next_action_at:null,updated_at:now}).eq('id',lead.id);
    return NextResponse.json({ok:true,channel});
  }catch(error:any){return NextResponse.json({error:String(error?.message||error).slice(0,240)},{status:502})}
}
