import {NextResponse} from 'next/server';
import {isAdminRequest} from '@/lib/admin-auth';
import {getLocationAccessToken} from '@/lib/highlevel-operational';
import {MEULOCAL_GHL_WORKFLOWS} from '@/lib/ghl-workflow-removal';

const LOCATION_ID='uNh3KsM7WFuLeTN8Q583';
export async function GET(request:Request){
  if(!await isAdminRequest(request))return NextResponse.json({error:'unauthorized'},{status:401});
  if(process.env.GHL_LOCATION_ID&&process.env.GHL_LOCATION_ID!==LOCATION_ID)return NextResponse.json({error:'location_mismatch'},{status:409});
  let token:string;
  try{token=await getLocationAccessToken(LOCATION_ID)}catch{return NextResponse.json({error:'credentials_unavailable'},{status:503})}
  try{
    const response=await fetch('https://services.leadconnectorhq.com/workflows/?locationId='+encodeURIComponent(LOCATION_ID),{
      method:'GET',
      headers:{Authorization:'Bearer '+token,Accept:'application/json',Version:'2021-07-28'},
      cache:'no-store',signal:AbortSignal.timeout(10000)
    });
    if(!response.ok)return NextResponse.json({mode:'read_only',httpStatus:response.status,authorized:false},{headers:{'Cache-Control':'no-store'}});
    const data=await response.json() as {workflows?:Array<{id?:string;name?:string;status?:string}>};
    const workflows=Array.isArray(data.workflows)?data.workflows:[];
    const matches=MEULOCAL_GHL_WORKFLOWS.map(id=>{
      const item=workflows.find(w=>w.id===id);
      return {id,found:Boolean(item),name:item?.name||null,status:item?.status||null};
    });
    return NextResponse.json({mode:'read_only',authorized:true,httpStatus:response.status,returnedCount:workflows.length,matches,allFound:matches.every(item=>item.found)},{headers:{'Cache-Control':'no-store'}});
  }catch{return NextResponse.json({mode:'read_only',error:'ghl_request_failed'},{status:502})}
}
