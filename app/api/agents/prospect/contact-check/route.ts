import {NextResponse} from 'next/server';
import {z} from 'zod';
import {isAdminRequest} from '@/lib/admin-auth';
import {findBusinessEmail} from '@/lib/ghl-prospecting';
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
   const r=await fetch('https://places.googleapis.com/v1/places/'+encodeURIComponent(placeId),{headers:{'X-Goog-Api-Key':key,'X-Goog-FieldMask':'websiteUri,nationalPhoneNumber,displayName,businessStatus'},cache:'no-store',signal:AbortSignal.timeout(7000)});
   if(!r.ok){results.push({id:business.id,name:business.name,channel:'blocked',reason:'google_places_http_'+r.status});continue}
   const p=await r.json();
   if(p.businessStatus&&p.businessStatus!=='OPERATIONAL'){results.push({id:business.id,name:business.name,channel:'blocked',reason:'business_not_operational'});continue}
   const email=p.websiteUri?await findBusinessEmail(p.websiteUri):null;
   const phone=String(p.nationalPhoneNumber||'').replace(/\D/g,'');
   const channel=email?'email':phone.length>=10?'whatsapp':'blocked';
   results.push({id:business.id,name:business.name,channel,email:email||null,phoneFound:phone.length>=10,reason:channel==='blocked'?'contact_not_found':'eligibility_and_delivery_NOT_VERIFIED'});
  }catch{results.push({id:business.id,name:business.name,channel:'blocked',reason:'contact_lookup_failed'})}
 }
 return NextResponse.json({results,contactAuthorized:false,dispatched:0},{headers:{'Cache-Control':'no-store'}});
}
