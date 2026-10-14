import {NextResponse} from 'next/server';
import {z} from 'zod';
import {isAdminRequest} from '@/lib/admin-auth';
import {findBusinessEmail} from '@/lib/ghl-prospecting';
import {createClient} from '@supabase/supabase-js';
import {assessProspectEligibility} from '@/lib/agents/prospect-eligibility';
export const runtime='nodejs';
export const maxDuration=60;
const schema=z.object({companies:z.array(z.object({id:z.string().min(5).max(180),name:z.string().min(2).max(180)}).strict()).min(1).max(5)}).strict();
async function checkGhlIdentifier(args:{email:string|null;phone:string;locationId:string;token?:string}){
 const result={identifierStatus:'NOT_VERIFIED',existingContact:false,dnd:false,reason:'identifier_search_not_verified'};
 if(!args.token||!args.locationId)return result;
 const value=args.email||args.phone;
 if(!value)return {...result,reason:'recipient_identifier_missing'};
 try{
  const response=await fetch('https://services.leadconnectorhq.com/contacts/search',{method:'POST',headers:{Authorization:'Bearer '+args.token,Version:'2021-07-28','Content-Type':'application/json'},body:JSON.stringify({locationId:args.locationId,query:value,page:1,pageLimit:20}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(4500)});
  if(!response.ok)return {...result,reason:'ghl_identifier_http_'+response.status};
  const body=await response.json();
  if(!Array.isArray(body.contacts)||body.contacts.length>20||body.contacts.some((c:any)=>c.locationId!==args.locationId))return {...result,reason:'ghl_identifier_contract_unverified'};
  const digits=(x:unknown)=>String(x||'').replace(/\\D/g,'');
  const matches=body.contacts.filter((c:any)=>args.email?String(c.email||'').toLowerCase()===args.email.toLowerCase():digits(c.phone).slice(-10)===digits(args.phone).slice(-10));
  const dnd=matches.some((c:any)=>c.dnd===true||Object.values(c.dndSettings||{}).some((v:any)=>v?.status==='active'));
  return {identifierStatus:matches.length?'EXISTING_CONTACT_FOUND':'NO_EXACT_IDENTIFIER_IN_BOUNDED_SEARCH',existingContact:matches.length>0,dnd,reason:matches.length?'existing_contact_requires_history_review':'no_exact_identifier_match_not_proof_of_eligibility'};
 }catch{return {...result,reason:'ghl_identifier_lookup_unavailable'}}
}
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
   results.push({id:business.id,name:business.name,channel,email:email||null,phoneFound:phone.length>=10,lookupPhone:phone,reason:channel==='blocked'?'contact_not_found':'eligibility_and_delivery_NOT_VERIFIED'});
  }catch{results.push({id:business.id,name:business.name,channel:'blocked',reason:'contact_lookup_failed'})}
 }
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
 const db=url&&serviceKey?createClient(url,serviceKey,{auth:{persistSession:false}}):undefined;
 const locationId=process.env.GHL_LOCATION_ID||'';
 const verified=[];
 for(const row of results){
  const eligibility=await assessProspectEligibility({lead:{externalId:'google_places:'+(row.id.startsWith('places/')?row.id.slice(7):row.id),name:row.name},locationId,db,token:process.env.GHL_API_KEY});
  const lookupPhone='lookupPhone' in row?String(row.lookupPhone||''):'';
  const safeRow={...row};delete (safeRow as {lookupPhone?:string}).lookupPhone;
  const identifier=await checkGhlIdentifier({email:'email' in row?String(row.email||''):null,phone:lookupPhone,locationId,token:process.env.GHL_API_KEY});
  verified.push({...safeRow,phone:lookupPhone?('+'+lookupPhone):null,...identifier,eligibilityStatus:eligibility.status,ghlStatus:eligibility.ghlStatus,eligibilityReasons:eligibility.reasons,contactAllowed:false});
 }
 return NextResponse.json({results:verified,contactAuthorized:false,dispatched:0},{headers:{'Cache-Control':'no-store'}});
}
