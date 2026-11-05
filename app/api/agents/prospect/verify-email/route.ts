import {NextResponse} from 'next/server';
import {z} from 'zod';
import {isAdminRequest} from '@/lib/admin-auth';
import {createClient} from '@supabase/supabase-js';
import {getLocationAccessToken} from '@/lib/highlevel-operational';
import {verifyRecipient,signRecipient,manualRecipientReadiness,MANUAL_LOCATION} from '@/lib/acquisition/manual-prospect';
import {interpretLCEmailVerification} from '@/lib/acquisition/ghl-email-verification';

export const runtime='nodejs';
export const maxDuration=40;
const schema=z.object({emailVerifyToken:z.string().min(10).max(4000),confirmed:z.literal(true)}).strict();
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
/** Only operator-initiated verification. This endpoint may incur an LC Email
 * validation charge. It does NOT create a GHL contact or send any message. */
export async function POST(req:Request){
 if(!await isAdminRequest(req))return json({error:'Não autorizado.'},401);
 const raw=await req.text().catch(()=>'');
 if(raw.length>5000)return json({error:'Solicitação inválida.'},413);
 let payload;
 try{payload=schema.parse(JSON.parse(raw))}catch{return json({error:'Confirme a verificação de e-mail antes de continuar.'},400)}
 let target;
 try{target=verifyRecipient(payload.emailVerifyToken)}catch{return json({error:'Verifique novamente o destinatário e os canais.'},409)}
 if(target.channel!=='email'||target.mailboxVerifiedAt!==undefined)return json({error:'Token de verificação inválido.'},409);
 if(process.env.GHL_LOCATION_ID!==MANUAL_LOCATION)return json({error:'Unidade HighLevel não configurada.'},503);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return json({error:'Banco não configurado.'},503);
 const db=createClient(url,key,{auth:{persistSession:false}});
 // Recheck local restrictions BEFORE incurring any paid LC verification.
 const readiness=await manualRecipientReadiness(db,target);
 if(!readiness.canSend)return json({
  status:'blocked',reason:readiness.reason,
  canSend:false,sendToken:null,verified:false,charged:false
 },409);
 let result;
 try{
  const token=await getLocationAccessToken(MANUAL_LOCATION,6000);
  const response=await fetch('https://services.leadconnectorhq.com/email/verify?locationId='+encodeURIComponent(MANUAL_LOCATION),{
   method:'POST',
   headers:{Authorization:'Bearer '+token,Version:'v3','Content-Type':'application/json',Accept:'application/json'},
   body:JSON.stringify({type:'email',verify:target.recipient}),
   redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12000)
  });
  if(!response.ok){
   const lackingScope=response.status===401||response.status===403;
   return json({status:'unverified',verified:false,canSend:false,sendToken:null,charged:'unknown',
    reason:lackingScope?'O HighLevel recusou a verificação. Confira a permissão lc-email.readonly e o serviço LC Email.':'A verificação de e-mail não foi concluída pelo HighLevel. Nenhum envio liberado.'
   },lackingScope?403:502);
  }
  result=interpretLCEmailVerification(await response.json(),target.recipient);
 }catch{
  return json({status:'unverified',verified:false,canSend:false,sendToken:null,charged:'unknown',
   reason:'Não foi possível confirmar o resultado do HighLevel. Não refaça automaticamente uma consulta que pode ter sido cobrada.'
  },502);
 }
 // Never turn unknown, catch-all, high-risk, or mismatched mailbox records green.
 if(!result.deliverable)return json({
  status:result.status,reason:result.reason,canSend:false,sendToken:null,verified:true,charged:true
 });
 // Short-lived signed proof; the actual send endpoint verifies it again.
 const sendToken=signRecipient({...target,mailboxVerifiedAt:Date.now()});
 return json({status:'deliverable',reason:result.reason,canSend:true,sendToken,verified:true,charged:true});
}
