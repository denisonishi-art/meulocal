import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {getLocationAccessToken,sendOperationalMessage,upsertOperationalContact} from '@/lib/highlevel-operational';

function authorized(req:Request){const secret=process.env.CRON_SECRET;return Boolean(secret&&req.headers.get('authorization')==='Bearer '+secret)}
function addDays(date:Date,days:number){const d=new Date(date);d.setUTCDate(d.getUTCDate()+days);d.setUTCHours(13,0,0,0);return d}
function nextRun(step:number,now:Date){if(step>=3)return null;return addDays(now,step===1?3:4).toISOString()}
function diagnosticUrl(token:string){return (process.env.NEXT_PUBLIC_APP_URL||'https://meulocal.ia.br')+'/d/'+token}
function subject(step:number,business:string){return step===1?'Diagnóstico do Google de '+business:step===2?'Você viu o diagnóstico da '+business+'?':'Último lembrete sobre seu diagnóstico'}
function emailBody(step:number,business:string,url:string){
 if(step===1)return 'Olá! Fizemos uma análise rápida da presença da '+business+' no Google e encontramos oportunidades objetivas para melhorar sua reputação local. Você pode ver o diagnóstico aqui:\n'+url+'\n\nSe fizer sentido, responda este e-mail e eu te explico os próximos passos. Se não quiser receber novos contatos, responda SAIR.';
 if(step===2)return 'Olá! Passando para confirmar se você conseguiu ver o diagnóstico da '+business+':\n'+url+'\n\nSe quiser, responda este e-mail e eu te mostro o que priorizar primeiro. Se não quiser receber novos contatos, responda SAIR.';
 return 'Olá! Este é meu último contato sobre o diagnóstico da '+business+'. Caso queira consultar, ele continua disponível aqui:\n'+url+'\n\nSe fizer sentido conversar, basta responder este e-mail. Se não quiser receber novos contatos, responda SAIR.';
}
function whatsappBody(step:number,business:string,url:string){
 if(step===1)return 'Olá! Fizemos uma análise rápida da presença da '+business+' no Google. O diagnóstico está aqui: '+url+'\n\nSe quiser, responda por aqui e eu te explico os principais pontos. Para não receber novas mensagens, responda SAIR.';
 if(step===2)return 'Olá! Só lembrando do diagnóstico da '+business+': '+url+'\n\nSe quiser, posso te explicar o que vale priorizar primeiro. Para não receber novas mensagens, responda SAIR.';
 return 'Olá! Último lembrete sobre o diagnóstico da '+business+': '+url+'\n\nSe quiser conversar, é só responder. Para não receber novas mensagens, responda SAIR.';
}
async function internalLocation(db:any){
 const fromEnv=process.env.GHL_INTERNAL_LOCATION_ID;if(fromEnv)return fromEnv;
 const {data}=await db.from('ghl_locations').select('ghl_location_id').eq('is_internal',true).eq('lifecycle_status','active').order('created_at',{ascending:false}).limit(1).maybeSingle();
 return data?.ghl_location_id||null;
}
export async function GET(req:Request){return run(req)}
export async function POST(req:Request){return run(req)}
async function run(req:Request){
 if(!authorized(req))return NextResponse.json({error:'Não autorizado.'},{status:401});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return NextResponse.json({error:'Banco não configurado.'},{status:503});
 const db=createClient(url,key,{auth:{persistSession:false}});
 const locationId=await internalLocation(db);
 if(!locationId)return NextResponse.json({ok:true,processed:0,status:'internal_location_not_configured'});
 let locationToken:string;
 try{locationToken=await getLocationAccessToken(locationId)}catch(error:any){return NextResponse.json({ok:true,processed:0,status:'location_token_error',error:String(error?.message||error).slice(0,200)})}
 const now=new Date();
 const {data:enrollments,error}=await db.from('automation_enrollments').select('id,lead_id,track,status,step,next_run_at,started_at,completed_at').eq('track','meulocal_acquisition').eq('status','active').lte('next_run_at',now.toISOString()).order('next_run_at',{ascending:true}).limit(50);
 if(error)return NextResponse.json({error:error.message},{status:500});
 let processed=0,failed=0,stopped=0;const details:any[]=[];
 for(const enrollment of enrollments||[]){
   const {data:lead}=await db.from('leads').select('id,business_id,name,email,whatsapp,consent_whatsapp,lifecycle_stage,prospect_diagnostic_id,ghl_contact_id,ghl_location_id,opt_out_at,last_reply_at').eq('id',enrollment.lead_id).maybeSingle();
   if(!lead)continue;
   if(lead.opt_out_at||lead.last_reply_at||['conversation','customer','lost'].includes(lead.lifecycle_stage)){await db.from('automation_enrollments').update({status:'completed',next_run_at:null,completed_at:now.toISOString()}).eq('id',enrollment.id);stopped++;continue}
   const {data:diag}=await db.from('prospect_diagnostics').select('id,public_token,business_name,status,converted_at,first_contact_at').eq('id',lead.prospect_diagnostic_id).maybeSingle();
   if(!diag)continue;
   if(diag.converted_at||diag.status==='converted'||diag.status==='closed'){await db.from('automation_enrollments').update({status:'completed',next_run_at:null,completed_at:now.toISOString()}).eq('id',enrollment.id);stopped++;continue}
   const nextStep=(enrollment.step||0)+1;
   if(nextStep>3){await db.from('automation_enrollments').update({status:'completed',next_run_at:null,completed_at:now.toISOString()}).eq('id',enrollment.id);continue}
   let channel:'email'|'whatsapp'|null=lead.email?'email':lead.whatsapp&&lead.consent_whatsapp?'whatsapp':null;
   if(!channel){await db.from('outreach_events').insert({lead_id:lead.id,channel:'system',event_type:'failed',provider:'meulocal',message_key:'acquisition_step_'+nextStep,metadata:{reason:'no_approved_channel'}});await db.from('automation_enrollments').update({status:'paused',next_run_at:null}).eq('id',enrollment.id);failed++;continue}
   try{
     let ghlContactId=lead.ghl_contact_id&&lead.ghl_location_id===locationId?lead.ghl_contact_id:null;
     if(!ghlContactId){const upserted=await upsertOperationalContact({token:locationToken,locationId,name:lead.name||diag.business_name,email:lead.email,phone:lead.whatsapp});ghlContactId=upserted.id;await db.from('leads').update({ghl_contact_id:ghlContactId,ghl_location_id:locationId,updated_at:now.toISOString()}).eq('id',lead.id);await db.from('businesses').update({ghl_contact_id:ghlContactId,ghl_location_id:locationId,status:'contacted',updated_at:now.toISOString()}).eq('id',lead.business_id)}
     const dUrl=diagnosticUrl(diag.public_token);const message=channel==='email'?emailBody(nextStep,diag.business_name,dUrl):whatsappBody(nextStep,diag.business_name,dUrl);
     const sent=await sendOperationalMessage({token:locationToken,contactId:ghlContactId,channel,message,subject:channel==='email'?subject(nextStep,diag.business_name):undefined,email:lead.email});
     const nr=nextRun(nextStep,now);
     await db.from('outreach_events').insert({lead_id:lead.id,channel,event_type:'sent',provider:'highlevel',external_id:sent.messageId||null,conversation_id:sent.conversationId||null,message_key:'acquisition_step_'+nextStep,metadata:{step:nextStep,diagnostic_id:diag.id,diagnostic_url:dUrl}});
     await db.from('automation_enrollments').update({step:nextStep,status:nextStep>=3?'completed':'active',next_run_at:nextStep>=3?null:nr,completed_at:nextStep>=3?now.toISOString():null}).eq('id',enrollment.id);
     await db.from('leads').update({lifecycle_stage:'mql',next_action_at:nextStep>=3?null:nr,updated_at:now.toISOString()}).eq('id',lead.id);
     await db.from('prospect_diagnostics').update({status:'contacted',first_contact_at:diag.first_contact_at||now.toISOString(),updated_at:now.toISOString()}).eq('id',diag.id);
     processed++;details.push({leadId:lead.id,step:nextStep,channel,status:'sent'});
   }catch(error:any){await db.from('outreach_events').insert({lead_id:lead.id,channel,event_type:'failed',provider:'highlevel',message_key:'acquisition_step_'+nextStep,metadata:{step:nextStep,error:String(error?.message||error).slice(0,300)}});failed++;details.push({leadId:lead.id,step:nextStep,channel,status:'failed',error:String(error?.message||error).slice(0,180)})}
 }
 return NextResponse.json({ok:true,processed,failed,stopped,details});
}