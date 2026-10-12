import {NextResponse} from 'next/server';
import {isAdminRequest} from '@/lib/admin-auth';
import {getLocationAccessToken} from '@/lib/highlevel-operational';
const LOCATION='uNh3KsM7WFuLeTN8Q583';
const TEST_NAME='QA MeuLocal Optout Inerte';
/** Read-only verification of inert synthetic QA contacts; never outputs PII. */
export async function GET(request:Request){
 if(!await isAdminRequest(request))return NextResponse.json({error:'unauthorized'},{status:401});
 if(process.env.GHL_LOCATION_ID&&process.env.GHL_LOCATION_ID!==LOCATION)return NextResponse.json({error:'location_mismatch'},{status:409});
 let token:string;
 try{token=await getLocationAccessToken(LOCATION)}catch{return NextResponse.json({error:'credentials_unavailable'},{status:503})}
 try{
  // Legacy list API supports server-side text search; bounded result and exact name validation below.
  const params=new URLSearchParams({locationId:LOCATION,query:TEST_NAME,limit:'20'});
  const res=await fetch('https://services.leadconnectorhq.com/contacts/?'+params,{
   method:'GET',headers:{Authorization:'Bearer '+token,Version:'2023-02-21',Accept:'application/json'},
   cache:'no-store',signal:AbortSignal.timeout(10000)
  });
  if(!res.ok)return NextResponse.json({mode:'read_only',authorized:false,httpStatus:res.status},{headers:{'Cache-Control':'no-store'}});
  const json=await res.json() as {contacts?:Array<{id?:string;name?:string;firstName?:string;lastName?:string;email?:string;phone?:string;tags?:string[];dnd?:boolean;locationId?:string}>};
  const contacts=Array.isArray(json.contacts)?json.contacts:[];
  const matches=contacts.filter(c=>c.name===TEST_NAME&&c.locationId===LOCATION).map(c=>({
   id:c.id,hasEmail:Boolean(c.email),hasPhone:Boolean(c.phone),tags:Array.isArray(c.tags)?c.tags:[],dnd:c.dnd===true
  }));
  return NextResponse.json({mode:'read_only',httpStatus:res.status,searchCount:contacts.length,testContacts:matches,workflowMembership:'not_checked',note:'Cadastro e tags somente; nenhuma inscricao ou retirada de workflow executada.'},{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({error:'ghl_read_failed'},{status:502})}
}
