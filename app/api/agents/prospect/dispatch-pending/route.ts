import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {isAdminRequest} from '@/lib/admin-auth';
import {enqueueGhlProspect,findBusinessEmail,sendGhlProspectWhatsApp} from '@/lib/ghl-prospecting';

type PlaceContact={website?:string|null;phone?:string|null};

async function placeContact(placeId:string):Promise<PlaceContact>{
  const key=process.env.GOOGLE_PLACES_API_KEY;
  if(!key)return {};
  const resource=placeId.startsWith('places/')?placeId:`places/${placeId}`;
  try{
    const response=await fetch(`https://places.googleapis.com/v1/${resource}`,{
      headers:{'X-Goog-Api-Key':key,'X-Goog-FieldMask':'websiteUri,nationalPhoneNumber'},
      signal:AbortSignal.timeout(7000)
    });
    if(!response.ok)return {};
    const place=await response.json();
    return {website:place.websiteUri||null,phone:place.nationalPhoneNumber||null};
  }catch{return {}}
}

async function trackDispatch(db:any,d:any,contact:PlaceContact,email:string|null,eventType:'queued'|'failed',channel:'email'|'whatsapp'|'system',result?:{contactId?:string|null;conversationId?:string|null},reason?:string){
  let business=(await db.from('businesses').select('id').eq('google_place_id',d.place_id).maybeSingle()).data;
  if(!business){
    const inserted=await db.from('businesses').insert({google_place_id:d.place_id,name:d.business_name,phone:contact.phone||null,website:contact.website||null,source:'outbound',status:eventType==='queued'?'contacted':'qualified'}).select('id').single();
    business=inserted.data;
  }
  if(!business?.id)return;
  let lead=(await db.from('leads').select('id').eq('prospect_diagnostic_id',d.id).maybeSingle()).data;
  if(!lead){
    const inserted=await db.from('leads').insert({business_id:business.id,name:d.business_name,email,whatsapp:contact.phone||null,consent_email:channel==='email',consent_whatsapp:channel==='whatsapp',origin:'outbound',lifecycle_stage:eventType==='queued'?'mql':'lead',automation_track:'meulocal_acquisition',prospect_diagnostic_id:d.id}).select('id').single();
    lead=inserted.data;
  }
  if(lead?.id){
    if(result?.contactId)await db.from('leads').update({ghl_contact_id:result.contactId,ghl_location_id:process.env.GHL_LOCATION_ID||'uNh3KsM7WFuLeTN8Q583',updated_at:new Date().toISOString()}).eq('id',lead.id);
    await db.from('outreach_events').insert({lead_id:lead.id,channel,event_type:eventType,provider:'highlevel',conversation_id:result?.conversationId||null,message_key:'diagnostic_initial',metadata:reason?{reason}:{source:'prospect_recovery'}});
  }
}

function cronAuthorized(req:Request){const secret=process.env.CRON_SECRET;return Boolean(secret&&req.headers.get('authorization')===`Bearer ${secret}`)}

export async function POST(req:Request){
  if(!await isAdminRequest(req))return NextResponse.json({error:'Não autorizado.'},{status:401});
  return dispatch(req);
}

export async function GET(req:Request){
  if(!cronAuthorized(req))return NextResponse.json({error:'Não autorizado.'},{status:401});
  return dispatch(req);
}

async function dispatch(req:Request){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!serviceKey)return NextResponse.json({error:'Banco não configurado.'},{status:503});
  try{
    const body=await req.json().catch(()=>({}));
    const ids=Array.isArray(body.diagnosticIds)?body.diagnosticIds.map(String).filter(Boolean):null;
    const db=createClient(url,serviceKey,{auth:{persistSession:false}});
    let query=db.from('prospect_diagnostics').select('id,place_id,business_name,public_token').eq('status','approved').order('created_at',{ascending:true}).limit(10);
    if(ids?.length)query=query.in('id',ids);
    const {data:diagnostics,error}=await query;
    if(error)throw error;
    const appUrl=process.env.NEXT_PUBLIC_APP_URL||new URL(req.url).origin;
    const results=await Promise.all((diagnostics||[]).map(async(d:any)=>{
      const contact=await placeContact(d.place_id);
      const email=await findBusinessEmail(contact.website);
      if(!email){
        if(!contact.phone){await trackDispatch(db,d,contact,null,'failed','system',undefined,'E-mail público e WhatsApp não encontrados');return {id:d.id,businessName:d.business_name,ok:false,reason:'E-mail público e WhatsApp não encontrados'};}
        const result=await sendGhlProspectWhatsApp({businessName:d.business_name,phone:contact.phone,diagnosticUrl:`${appUrl}/d/${d.public_token}`});
        if(result.ok){await db.from('prospect_diagnostics').update({status:'contacted',first_contact_at:new Date().toISOString()}).eq('id',d.id);await trackDispatch(db,d,contact,null,'queued','whatsapp',result);}
        else await trackDispatch(db,d,contact,null,'failed','whatsapp',undefined,result.reason);
        return {id:d.id,businessName:d.business_name,...result};
      }
      const result=await enqueueGhlProspect({
        businessName:d.business_name,email,phone:contact.phone,website:contact.website,
        diagnosticUrl:`${appUrl}/d/${d.public_token}`
      });
      if(result.ok){await db.from('prospect_diagnostics').update({status:'contacted',first_contact_at:new Date().toISOString()}).eq('id',d.id);await trackDispatch(db,d,contact,email,'queued','email',result);}
      else await trackDispatch(db,d,contact,email,'failed','email',undefined,result.reason);
      return {id:d.id,businessName:d.business_name,email,...result};
    }));
    return NextResponse.json({ok:true,processed:results.length,contactStarted:results.filter(x=>x.ok).length,results});
  }catch(error:any){
    return NextResponse.json({error:error?.message||'Não foi possível disparar os prospects pendentes.'},{status:500});
  }
}
