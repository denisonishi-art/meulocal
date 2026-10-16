import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {z} from 'zod';
import {isAdminRequest} from '@/lib/admin-auth';
import {deliverAcquisitionMessage} from '@/lib/acquisition/delivery';
import {verifyRecipient,manualRecipientReadiness,findExactRecipient,MANUAL_LOCATION} from '@/lib/acquisition/manual-prospect';
import {getLocationAccessToken,getOperationalContact} from '@/lib/highlevel-operational';
export const runtime='nodejs';export const maxDuration=120;
const schema=z.object({sendToken:z.string().min(10).max(4000),requestId:z.string().uuid(),message:z.string().min(50).max(1800),confirmed:z.literal(true)}).strict();
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function POST(req:Request){
 if(!await isAdminRequest(req))return json({error:'Não autorizado.'},401);
 if(process.env.MEULOCAL_MANUAL_OUTREACH_ENABLED!=='true')return json({error:'Envio manual desativado.'},423);
 const raw=await req.text();if(raw.length>10000)return json({error:'Solicitação muito grande.'},413);
 let parsed;try{parsed=schema.safeParse(JSON.parse(raw))}catch{return json({error:'Confira a mensagem e o destinatário.'},400)}
 if(!parsed.success)return json({error:'Confira a mensagem e o destinatário.'},400);
 let target;try{target=verifyRecipient(parsed.data.sendToken)}catch{return json({error:'Verifique novamente os canais antes de enviar.'},409)}
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return json({error:'Operação indisponível.'},503);
 const db=createClient(url,key,{auth:{persistSession:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(6000)})}});
 const ready=await manualRecipientReadiness(db,target);
 if(!ready.canSend)return json({error:ready.reason},409);
 let preparing=false;
 try{
  const reserved=await db.rpc('prepare_manual_prospect',{p_request_id:parsed.data.requestId,p_place_id:target.id.replace(/^places\//,''),p_name:target.name,p_address:target.address||null,p_channel:target.channel,p_recipient:target.recipient,p_message:parsed.data.message});
  if(reserved.error||!reserved.data?.leadId)return json({error:'Não foi possível preparar um vínculo único. Confira histórico e destinatário; nenhuma mensagem foi enviada.'},409);
  const job=reserved.data;
  if(job.state==='reconciliation_required')return json({error:'Preparação anterior com resultado incerto. Confira o vínculo no HighLevel antes de tentar outro envio.'},409);
  if(job.state==='prepare'){
   preparing=true;
   const token=await getLocationAccessToken(MANUAL_LOCATION,6000);
   let contact=await findExactRecipient(token,target);
   if(!contact){
    if(target.channel!=='email')throw Error('unverified_whatsapp');
    // Create only after the operator confirms this exact recipient and message.
    // No tags, form submissions, workflow enrollment or contact upsert.
    const r=await fetch('https://services.leadconnectorhq.com/contacts/',{method:'POST',headers:{Authorization:'Bearer '+token,Version:'2021-07-28','Content-Type':'application/json'},body:JSON.stringify({locationId:MANUAL_LOCATION,name:target.name,email:target.recipient,source:'MeuLocal — envio manual'}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});
    const body=await r.json();if(!r.ok||!body.contact?.id)throw Error('contact_creation_unconfirmed');
    contact=await getOperationalContact({token,contactId:body.contact.id,timeoutMs:6000});
   }
   const same=target.channel==='email'?String(contact?.email||'').trim().toLowerCase()===target.recipient:String(contact?.phone||'').replace(/\D/g,'')===target.recipient.replace(/\D/g,'');
   if(!same||contact?.locationId!==MANUAL_LOCATION||!contact.id)throw Error('contact_identity_unconfirmed');
   const bound=await db.rpc('bind_manual_prospect',{p_request_id:parsed.data.requestId,p_lease:job.lease,p_contact_id:contact.id});
   if(bound.error||bound.data?.leadId!==job.leadId)throw Error('contact_binding_unconfirmed');
  }else if(job.state!=='ready')throw Error('manual_state_invalid');
  const result=await deliverAcquisitionMessage(db,{leadId:job.leadId,kind:'manual',step:null,requestId:parsed.data.requestId,channel:target.channel,message:parsed.data.message,subject:'Uma pergunta para '+target.name});
  return json(result,result.ok&&!('stopped' in result)?200:409);
 }catch{return json({error:preparing?'Preparação com resultado não confirmado. Confira o vínculo no HighLevel; não repita com outra tentativa.':'Não foi possível confirmar o envio. Confira os registros antes de tentar novamente.'},503)}
}
