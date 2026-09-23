import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {isAdminRequest} from '@/lib/admin-auth';
import {enqueueGhlProspect,findBusinessEmail} from '@/lib/ghl-prospecting';

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

export async function POST(req:Request){
  if(!await isAdminRequest(req))return NextResponse.json({error:'Não autorizado.'},{status:401});
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
      if(!email)return {id:d.id,businessName:d.business_name,ok:false,reason:'E-mail público não encontrado'};
      const result=await enqueueGhlProspect({
        businessName:d.business_name,email,phone:contact.phone,website:contact.website,
        diagnosticUrl:`${appUrl}/d/${d.public_token}`
      });
      if(result.ok)await db.from('prospect_diagnostics').update({status:'contacted',first_contact_at:new Date().toISOString()}).eq('id',d.id);
      return {id:d.id,businessName:d.business_name,email,...result};
    }));
    return NextResponse.json({ok:true,processed:results.length,contactStarted:results.filter(x=>x.ok).length,results});
  }catch(error:any){
    return NextResponse.json({error:error?.message||'Não foi possível disparar os prospects pendentes.'},{status:500});
  }
}
