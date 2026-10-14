import {NextResponse} from 'next/server';
import {isAdminRequest} from '@/lib/admin-auth';
import {getLocationAccessToken} from '@/lib/highlevel-operational';

const LOCATION='uNh3KsM7WFuLeTN8Q583';
/** Creates exactly one inert QA contact. Never enrolls, tags, messages or updates existing contacts. */
export async function POST(request:Request){
  if(!await isAdminRequest(request))return NextResponse.json({error:'unauthorized'},{status:401});
  if(request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'origin_mismatch'},{status:403});
  if(request.headers.get('x-meulocal-test-contact')!=='create-inert-contact')return NextResponse.json({error:'confirmation_required'},{status:400});
  if(process.env.GHL_LOCATION_ID&&process.env.GHL_LOCATION_ID!==LOCATION)return NextResponse.json({error:'location_mismatch'},{status:409});
  let token:string;
  try{token=await getLocationAccessToken(LOCATION)}catch{return NextResponse.json({error:'credentials_unavailable'},{status:503})}
  try{
    const resp=await fetch('https://services.leadconnectorhq.com/contacts/',{
      method:'POST',headers:{Authorization:'Bearer '+token,Version:'v3',Accept:'application/json','Content-Type':'application/json'},
      body:JSON.stringify({locationId:LOCATION,firstName:'QA',lastName:'MeuLocal Optout Inerte',name:'QA MeuLocal Optout Inerte',source:'MeuLocal QA - sem contato',dnd:true,tags:[]}),
      cache:'no-store',signal:AbortSignal.timeout(12000)
    });
    if(!resp.ok)return NextResponse.json({created:false,ghlHttpStatus:resp.status,error:'ghl_create_rejected'},{status:resp.status>=500?502:resp.status});
    const json=await resp.json() as {contact?:{id?:string}};
    const id=json?.contact?.id;
    if(!id)return NextResponse.json({created:false,error:'ghl_id_missing'},{status:502});
    return NextResponse.json({created:true,contactId:id,locationId:LOCATION,channel:'none',dnd:true,tags:[],workflowEnrolled:false,notice:'Contato sintético sem telefone/e-mail. Nenhum opt-out real foi testado.'},{status:201,headers:{'Cache-Control':'no-store'}});
  }catch{return NextResponse.json({created:false,error:'ghl_request_failed'},{status:502})}
}
