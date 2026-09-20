import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';

function isAuthorized(req:Request){
  const secret=process.env.CRON_SECRET;
  return Boolean(secret&&req.headers.get('authorization')===`Bearer ${secret}`);
}
function isWeekend(d:Date){const n=d.getUTCDay();return n===0||n===6}
function nextWeekday(d:Date){
  const x=new Date(d);
  while(isWeekend(x))x.setUTCDate(x.getUTCDate()+1);
  return x;
}
function nextAttemptAt(now:Date,attemptsAfterSend:number){
  if(attemptsAfterSend>=3)return null;
  const add=attemptsAfterSend===1?3:4;
  const d=new Date(now);d.setUTCDate(d.getUTCDate()+add);d.setUTCHours(12,0,0,0);
  return nextWeekday(d).toISOString();
}
function businessDayNumber(activatedAt:string|null|undefined,now:Date){
  if(!activatedAt)return 3;
  let d=new Date(activatedAt);d.setUTCHours(0,0,0,0);
  const end=new Date(now);end.setUTCHours(0,0,0,0);
  let count=0;
  while(d<=end){if(!isWeekend(d))count++;d.setUTCDate(d.getUTCDate()+1)}
  return Math.max(1,count);
}
function dailyLimit(settings:any,now:Date){
  const day=businessDayNumber(settings.activated_at,now);
  return day===1?settings.day1_limit:day===2?settings.day2_limit:settings.steady_limit;
}

export async function GET(req:Request){return run(req)}
export async function POST(req:Request){return run(req)}

async function run(req:Request){
  if(!isAuthorized(req))return NextResponse.json({error:'Não autorizado.'},{status:401});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const webhook=process.env.GHL_REVIEW_REQUEST_WEBHOOK_URL;
  if(!url||!key)return NextResponse.json({error:'Banco não configurado.'},{status:503});
  if(!webhook)return NextResponse.json({ok:true,processed:0,status:'channel_not_configured'});
  const db=createClient(url,key,{auth:{persistSession:false}});
  const now=new Date();
  const {data:settings,error:settingsError}=await db.from('review_request_settings').select('*').eq('status','active');
  if(settingsError)return NextResponse.json({error:settingsError.message},{status:500});

  let processed=0,failed=0,completed=0,optedOut=0;
  const details:any[]=[];
  for(const setting of settings||[]){
    const limit=dailyLimit(setting,now);
    const {data:due,error:dueError}=await db.from('review_request_enrollments')
      .select('id,business_id,contact_id,status,current_step,attempts,next_run_at')
      .eq('business_id',setting.business_id).in('status',['queued','active'])
      .lte('next_run_at',now.toISOString()).order('next_run_at',{ascending:true}).limit(limit);
    if(dueError){details.push({businessId:setting.business_id,error:dueError.message});continue}
    if(!due?.length){details.push({businessId:setting.business_id,limit,due:0});continue}

    const contactIds=due.map((x:any)=>x.contact_id);
    const {data:contacts}=await db.from('customer_contacts').select('id,name,email,whatsapp,status,opt_out_at').in('id',contactIds);
    const byId=new Map((contacts||[]).map((x:any)=>[x.id,x]));
    let businessProcessed=0;

    for(const enrollment of due){
      const contact:any=byId.get(enrollment.contact_id);
      if(!contact)continue;
      if(contact.opt_out_at||contact.status==='opted_out'){
        await db.from('review_request_enrollments').update({status:'opted_out',completed_at:now.toISOString(),next_run_at:null,updated_at:now.toISOString()}).eq('id',enrollment.id);
        await db.from('review_request_events').insert({business_id:setting.business_id,enrollment_id:enrollment.id,contact_id:contact.id,channel:'system',event_type:'opted_out',provider:'meulocal'});
        optedOut++;continue;
      }
      const {data:stopEvents}=await db.from('review_request_events').select('event_type').eq('enrollment_id',enrollment.id).in('event_type',['replied','opted_out','review_observed']).limit(1);
      if(stopEvents?.length){
        const type=stopEvents[0].event_type;
        await db.from('review_request_enrollments').update({status:type==='opted_out'?'opted_out':'completed',completed_at:now.toISOString(),next_run_at:null,updated_at:now.toISOString()}).eq('id',enrollment.id);
        await db.from('customer_contacts').update({status:type==='opted_out'?'opted_out':'completed',updated_at:now.toISOString()}).eq('id',contact.id);
        completed++;continue;
      }

      const channel=contact.whatsapp?'whatsapp':contact.email?'email':null;
      if(!channel){
        await db.from('review_request_enrollments').update({status:'failed',next_run_at:null,updated_at:now.toISOString()}).eq('id',enrollment.id);
        await db.from('customer_contacts').update({status:'invalid',updated_at:now.toISOString()}).eq('id',contact.id);
        await db.from('review_request_events').insert({business_id:setting.business_id,enrollment_id:enrollment.id,contact_id:contact.id,channel:'system',event_type:'failed',provider:'meulocal',metadata:{reason:'no_valid_channel'}});
        failed++;continue;
      }

      const attempt=enrollment.attempts+1;
      try{
        const response=await fetch(webhook,{
          method:'POST',
          headers:{'Content-Type':'application/json',...(process.env.GHL_REVIEW_REQUEST_WEBHOOK_SECRET?{'x-meulocal-token':process.env.GHL_REVIEW_REQUEST_WEBHOOK_SECRET}:{})},
          body:JSON.stringify({
            source:'meulocal',businessId:setting.business_id,contactId:contact.id,enrollmentId:enrollment.id,
            name:contact.name||'',email:contact.email||'',whatsapp:contact.whatsapp||'',channel,
            attempt,messageKey:attempt===1?'review_request_d0':attempt===2?'review_request_d3':'review_request_d7'
          }),
          cache:'no-store'
        });
        const payload=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(payload?.message||payload?.error||'Falha no canal operacional');
        const next=nextAttemptAt(now,attempt);
        const done=attempt>=setting.max_attempts;
        await db.from('review_request_events').insert({
          business_id:setting.business_id,enrollment_id:enrollment.id,contact_id:contact.id,channel,event_type:'sent',provider:'highlevel',
          external_id:payload?.id||payload?.messageId||null,metadata:{attempt,message_key:attempt===1?'review_request_d0':attempt===2?'review_request_d3':'review_request_d7'}
        });
        await db.from('review_request_enrollments').update({
          status:done?'completed':'active',attempts:attempt,current_step:attempt,last_sent_at:now.toISOString(),
          next_run_at:done?null:next,completed_at:done?now.toISOString():null,updated_at:now.toISOString()
        }).eq('id',enrollment.id);
        await db.from('customer_contacts').update({status:done?'completed':'active',updated_at:now.toISOString()}).eq('id',contact.id);
        businessProcessed++;processed++;if(done)completed++;
      }catch(error:any){
        await db.from('review_request_events').insert({business_id:setting.business_id,enrollment_id:enrollment.id,contact_id:contact.id,channel,event_type:'failed',provider:'highlevel',metadata:{attempt,error:String(error?.message||error).slice(0,300)}});
        failed++;
      }
    }
    details.push({businessId:setting.business_id,limit,due:due.length,processed:businessProcessed});
  }
  return NextResponse.json({ok:true,processed,failed,completed,optedOut,details});
}