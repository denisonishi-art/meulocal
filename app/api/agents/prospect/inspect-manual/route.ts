import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {z} from 'zod';
import {isAdminRequest} from '@/lib/admin-auth';
import {getLocationAccessToken} from '@/lib/highlevel-operational';
import {findExactRecipient,MANUAL_LOCATION} from '@/lib/acquisition/manual-prospect';

export const runtime='nodejs';
export const maxDuration=45;
const schema=z.object({placeId:z.string().min(8).max(180).regex(/^[A-Za-z0-9_-]+$/)}).strict();
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
type Attempt={
 request_id:string;place_id:string;name:string;address:string|null;
 recipient:string;channel:'email'|'whatsapp';lead_id:string;
 contact_id:string|null;stage:string;created_at:string;expires_at:string;
};
export async function POST(req:Request){
 if(!await isAdminRequest(req))return json({error:'Não autorizado.'},401);
 const body=await req.text().catch(()=>'');
 if(body.length>500)return json({error:'Solicitação inválida.'},413);
 let parsed;try{parsed=schema.safeParse(JSON.parse(body))}catch{return json({error:'Parâmetros inválidos.'},400)}
 if(!parsed.success)return json({error:'Empresa inválida.'},400);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return json({error:'Banco indisponível.'},503);
 const db=createClient(url,key,{auth:{persistSession:false}});
 const {data:attempts,error:attemptError}=await db.from('manual_prospect_permissions')
  .select('request_id,place_id,name,address,recipient,channel,lead_id,contact_id,stage,created_at,expires_at')
  .eq('place_id',parsed.data.placeId).order('created_at',{ascending:false}).limit(3);
 if(attemptError)return json({error:'Histórico de preparação indisponível.'},503);
 if(!Array.isArray(attempts)||!attempts.length)return json({status:'not_attempted',attempts:[],sent:0,checkedProvider:false,contactStarted:false});
 const ids=[...new Set((attempts as Attempt[]).map(a=>a.lead_id))];
 const {data:events,error:eventsError}=await db.from('outreach_events')
  .select('lead_id,event_type,dispatch_state,external_id,created_at')
  .in('lead_id',ids).order('created_at',{ascending:false}).limit(100);
 if(eventsError||!Array.isArray(events)||events.length===100)return json({error:'Não foi possível confirmar o histórico. Nenhum reenvio autorizado.'},503);
 let token:string|null=null,providerAccessible=false;
 try{token=await getLocationAccessToken(MANUAL_LOCATION,6000);providerAccessible=true}catch{/* Provider unknown is never inferred absent. */}
 const reports=[];
 for(const a of attempts as Attempt[]){
  const linked=events.filter(e=>e.lead_id===a.lead_id);
  const actualSend=linked.filter(e=>e.event_type==='sent'&&Boolean(e.external_id));
  const started=linked.some(e=>e.dispatch_state==='dispatching'||e.dispatch_state==='ambiguous');
  let providerContact:'found'|'not_found'|'unverified'='unverified';
  if(token){
   try{
    const found=await findExactRecipient(token,{
     id:a.place_id,name:a.name,address:a.address||undefined,
     channel:a.channel,recipient:a.recipient
    });
    providerContact=found?'found':'not_found';
   }catch{/* Read-only provider check failed or returned ambiguous identity. */}
  }
  let interpretation='Sem comprovação de envio. A situação no HighLevel deve ser conferida.';
  if(actualSend.length)interpretation='Existe evento de envio aceito e comprovante no banco; entrega ainda exige confirmação.';
  else if(started)interpretation='Há tentativa de despacho com resultado indeterminado; não reenviar.';
  else if(a.stage==='provisioning')interpretation='Preparação interrompida ANTES do envio pelo MeuLocal. O cadastro no HighLevel pode ter sido criado; não repetir.';
  else if(a.stage==='ready')interpretation='Contato preparado, mas sem evento de envio registrado.';
  reports.push({
   name:a.name,recipient:a.recipient,channel:a.channel,
   stage:a.stage,createdAt:a.created_at,expiresAt:a.expires_at,
   providerContact,providerAccessible,hasSendReceipt:actualSend.length>0,
   possibleDispatch:started,
   interpretation,retryAllowed:false,
   // Do not expose provider IDs or allow a read-only operation to mutate a lead.
   callsToProvider:'read_only',sent:0,created:0
  });
 }
 return json({status:reports.some(r=>r.hasSendReceipt)?'send_recorded':reports.some(r=>r.stage==='provisioning')?'provisioning_unconfirmed':'checked',
  attempts:reports,checkedProvider:providerAccessible,sent:0,contactStarted:false});
}
