import {NextResponse} from 'next/server';
import {z} from 'zod';
import {isAdminRequest} from '@/lib/admin-auth';
import {findBusinessEmail} from '@/lib/ghl-prospecting';
import {createClient} from '@supabase/supabase-js';
import {manualRecipientReadiness} from '@/lib/acquisition/manual-prospect';
export const runtime='nodejs';
export const maxDuration=60;
const schema=z.object({companies:z.array(z.object({id:z.string().min(5).max(180),name:z.string().min(2).max(180)}).strict()).min(1).max(5)}).strict();
export async function POST(req:Request){
 if(!await isAdminRequest(req))return NextResponse.json({error:'Não autorizado'},{status:401});
 let data:unknown;try{const raw=await req.text();if(raw.length>5000)return NextResponse.json({error:'Payload muito grande'},{status:413});data=JSON.parse(raw)}catch{return NextResponse.json({error:'JSON inválido'},{status:400})}
 const parsed=schema.safeParse(data);if(!parsed.success)return NextResponse.json({error:'Seleção inválida'},{status:400});
 const key=process.env.GOOGLE_PLACES_API_KEY;if(!key)return NextResponse.json({error:'Google Places indisponível'},{status:503});
 const results=[];
 for(const business of parsed.data.companies){
  try{
   const placeId=business.id.replace(/^places\//,'');
   if(!/^[A-Za-z0-9_-]{8,}$/.test(placeId)){results.push({id:business.id,name:business.name,channel:'blocked',reason:'google_place_id_invalid'});continue}
   const r=await fetch('https://places.googleapis.com/v1/places/'+encodeURIComponent(placeId),{headers:{'X-Goog-Api-Key':key,'X-Goog-FieldMask':'websiteUri,nationalPhoneNumber,internationalPhoneNumber,formattedAddress,displayName,businessStatus'},cache:'no-store',signal:AbortSignal.timeout(7000)});
   if(!r.ok){results.push({id:business.id,name:business.name,channel:'blocked',reason:'google_places_http_'+r.status});continue}
   const p=await r.json();
   if(p.businessStatus&&p.businessStatus!=='OPERATIONAL'){results.push({id:business.id,name:business.name,channel:'blocked',reason:'business_not_operational'});continue}
   const email=p.websiteUri?(await findBusinessEmail(p.websiteUri))?.trim().toLowerCase():null;
   const national=String(p.nationalPhoneNumber||'').replace(/\D/g,'');
   const phone=String(p.internationalPhoneNumber||'').replace(/\D/g,'')||((national.length===10||national.length===11)?'55'+national:'');
   const channel=email?'email':phone.length>=10?'whatsapp':'blocked';
   results.push({id:business.id,name:business.name,channel,email:email||null,phoneFound:phone.length>=10,lookupPhone:phone,address:p.formattedAddress||'',reason:channel==='blocked'?'contact_not_found':'eligibility_and_delivery_NOT_VERIFIED'});
  }catch{results.push({id:business.id,name:business.name,channel:'blocked',reason:'contact_lookup_failed'})}
 }
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
 const db=url&&serviceKey?createClient(url,serviceKey,{auth:{persistSession:false}}):undefined;
 const verified=await Promise.all(results.map(async row=>{
  const lookupPhone='lookupPhone' in row?String(row.lookupPhone||''):'';
  const safeRow={...row};delete (safeRow as {lookupPhone?:string}).lookupPhone;
  const recipient=row.channel==='email'&&'email' in row?String(row.email):lookupPhone?'+'+lookupPhone:'';
  const readiness=db&&recipient&&row.channel!=='blocked'?await manualRecipientReadiness(db,{id:row.id,name:row.name,address:'address' in row?String(row.address||''):'',channel:row.channel==='email'?'email':'whatsapp',recipient}):{canSend:false,reason:row.channel==='blocked'?'Nenhum canal encontrado.':'Não foi possível conferir a operação.',sendToken:null};
  return {...safeRow,phone:lookupPhone?'+'+lookupPhone:null,...readiness,contactAllowed:readiness.canSend};
 }));
 return NextResponse.json({results:verified,contactAuthorized:false,dispatched:0},{headers:{'Cache-Control':'no-store'}});
}
