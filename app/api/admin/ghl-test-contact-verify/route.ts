import {NextResponse} from 'next/server';
import {isAdminRequest} from '@/lib/admin-auth';
import {getLocationAccessToken} from '@/lib/highlevel-operational';
const LOCATION='uNh3KsM7WFuLeTN8Q583';
const EXPECTED='qa meulocal optout inerte';
const normalize=(s:unknown)=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
/** Bounded read-only verification. Only exposes details of exact synthetic QA records. */
export async function GET(request:Request){
 if(!await isAdminRequest(request))return NextResponse.json({error:'unauthorized'},{status:401});
 if(process.env.GHL_LOCATION_ID&&process.env.GHL_LOCATION_ID!==LOCATION)return NextResponse.json({error:'location_mismatch'},{status:409});
 let token:string;
 try{token=await getLocationAccessToken(LOCATION)}catch{return NextResponse.json({error:'credentials_unavailable'},{status:503})}
 try{
  const params=new URLSearchParams({locationId:LOCATION,query:'QA MeuLocal Optout Inerte',limit:'20'});
  const res=await fetch('https://services.leadconnectorhq.com/contacts/?'+params,{method:'GET',headers:{Authorization:'Bearer '+token,Version:'2023-02-21',Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(!res.ok)return NextResponse.json({mode:'read_only',httpStatus:res.status,authorized:false},{headers:{'Cache-Control':'no-store'}});
  const json=await res.json() as {contacts?:Array<{id?:string;name?:string;firstName?:string;lastName?:string;email?:string;phone?:string;tags?:string[];dnd?:boolean;locationId?:string}>};
  const contacts=Array.isArray(json.contacts)?json.contacts:[];
  const nameMatches=contacts.filter(c=>normalize(c.name)===EXPECTED||normalize([c.firstName,c.lastName].filter(Boolean).join(' '))===EXPECTED);
  const matches=nameMatches.filter(c=>!c.locationId||c.locationId===LOCATION);
  return NextResponse.json({
   mode:'read_only',httpStatus:res.status,searchCount:contacts.length,nameMatches:nameMatches.length,
   locationFieldPresent:contacts.filter(c=>typeof c.locationId==='string').length,
   diagnostic:{missingNameField:contacts.filter(c=>!c.name).length,missingLocationField:contacts.filter(c=>!c.locationId).length},
   testContacts:matches.map(c=>({id:c.id,locationVerified:c.locationId===LOCATION,hasEmail:Boolean(c.email),hasPhone:Boolean(c.phone),tags:Array.isArray(c.tags)?c.tags:[],dnd:c.dnd===true})),
   workflowMembership:'not_checked',note:'Ausencia de locationId no retorno nao comprova associacao; nenhum workflow alterado.'
  },{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({error:'ghl_read_failed'},{status:502})}
}
