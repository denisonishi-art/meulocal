import {NextResponse} from 'next/server';
import {customerContext,requireActiveAccount} from '@/lib/customer-context';

function isoDate(d:Date){return d.toISOString().slice(0,10)}
function weekday(d:Date){const day=d.getUTCDay();return day!==0&&day!==6}
function nextBusinessDay(from:Date,include=true){
  const d=new Date(Date.UTC(from.getUTCFullYear(),from.getUTCMonth(),from.getUTCDate()));
  if(!include)d.setUTCDate(d.getUTCDate()+1);
  while(!weekday(d))d.setUTCDate(d.getUTCDate()+1);
  return d;
}
function atNineSaoPaulo(date:Date){return isoDate(date)+'T12:00:00.000Z'}

export async function POST(req:Request){
  const c=await customerContext(req);
  if(!c)return NextResponse.json({error:'Não autorizado.'},{status:401});
  if(!requireActiveAccount(c.account))return NextResponse.json({error:'Assinatura ativa necessária.'},{status:403});
  try{
    const {confirmed}=await req.json().catch(()=>({confirmed:false}));
    if(confirmed!==true)return NextResponse.json({error:'Confirme a ativação antes de iniciar a régua.'},{status:400});
    const businessId=c.account!.business_id;

    const {data:contacts,error:contactsError}=await c.admin.from('customer_contacts')
      .select('id,name,email,whatsapp,last_purchase_at,status')
      .eq('business_id',businessId).eq('status','eligible')
      .order('last_purchase_at',{ascending:false,nullsFirst:false}).order('created_at',{ascending:true}).limit(10000);
    if(contactsError)throw contactsError;
    if(!contacts?.length)return NextResponse.json({error:'Não há contatos elegíveis para ativar.'},{status:409});

    const ids=contacts.map((x:any)=>x.id);
    const {data:existing}=await c.admin.from('review_request_enrollments').select('contact_id').in('contact_id',ids);
    const enrolled=new Set((existing||[]).map((x:any)=>x.contact_id));
    const fresh=contacts.filter((x:any)=>!enrolled.has(x.id));
    if(!fresh.length)return NextResponse.json({ok:true,alreadyActive:true,queued:0,message:'Todos os contatos elegíveis já estão na automação.'});

    const now=new Date();
    let day=nextBusinessDay(now,true);
    let dayIndex=1;
    let usedToday=0;
    const limitFor=(i:number)=>i===1?30:i===2?40:50;
    const rows:any[]=[];
    for(const contact of fresh){
      let limit=limitFor(dayIndex);
      if(usedToday>=limit){day=nextBusinessDay(day,false);dayIndex++;usedToday=0;limit=limitFor(dayIndex)}
      rows.push({
        business_id:businessId,contact_id:contact.id,status:'queued',activation_date:isoDate(day),
        current_step:0,attempts:0,next_run_at:atNineSaoPaulo(day)
      });
      usedToday++;
    }

    const {error:enrollError}=await c.admin.from('review_request_enrollments').insert(rows);
    if(enrollError)throw enrollError;
    await c.admin.from('customer_contacts').update({status:'queued',updated_at:new Date().toISOString()}).in('id',fresh.map((x:any)=>x.id));
    const activatedAt=new Date().toISOString();
    const {error:settingsError}=await c.admin.from('review_request_settings').upsert({
      business_id:businessId,status:'active',day1_limit:30,day2_limit:40,steady_limit:50,weekdays_only:true,
      max_attempts:3,reminder_day_offsets:[0,3,7],timezone:'America/Sao_Paulo',activated_at:activatedAt,paused_at:null,updated_at:activatedAt
    },{onConflict:'business_id'});
    if(settingsError)throw settingsError;

    const lastDate=rows[rows.length-1]?.activation_date;
    return NextResponse.json({
      ok:true,queued:rows.length,day1:Math.min(30,rows.length),day2:Math.min(40,Math.max(0,rows.length-30)),
      steadyLimit:50,weekdaysOnly:true,maxAttempts:3,reminders:[0,3,7],firstActivationDate:rows[0]?.activation_date,lastActivationDate:lastDate
    });
  }catch(error:any){
    return NextResponse.json({error:error?.message||'Não foi possível ativar a automação.'},{status:500});
  }
}