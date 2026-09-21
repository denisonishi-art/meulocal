import {NextResponse} from 'next/server';
import {getLocationAccessToken,getOperationalConversationMessages} from '@/lib/highlevel-operational';

const TEST_TOKEN='meulocal-reply-check-20260920';
const LOCATION_ID='uNh3KsM7WFuLeTN8Q583';
const CONVERSATION_ID='zpRgQSgGO8NVMo0RtdGe';

export async function GET(req:Request){
  const u=new URL(req.url);
  if(u.searchParams.get('token')!==TEST_TOKEN)return NextResponse.json({error:'Não autorizado.'},{status:401});
  try{
    const access=await getLocationAccessToken(LOCATION_ID);
    const messages=await getOperationalConversationMessages({token:access,conversationId:CONVERSATION_ID,limit:50});
    const inbound=messages.filter((m:any)=>String(m?.direction||'').toLowerCase()==='inbound').sort((a:any,b:any)=>new Date(b?.dateAdded||0).getTime()-new Date(a?.dateAdded||0).getTime())[0]||null;
    return NextResponse.json({ok:true,inbound:inbound?{id:inbound.id||null,dateAdded:inbound.dateAdded||null,messageType:inbound.messageType||null,body:inbound.body||null}:null,count:messages.length});
  }catch(error:any){return NextResponse.json({ok:false,error:String(error?.message||error)},{status:502})}
}