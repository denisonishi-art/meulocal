import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {reconcileAcquisitionMessages} from '@/lib/meulocal-inbound';
import {findOperationalConversation,getLocationAccessToken,getOperationalConversationMessages} from '@/lib/highlevel-operational';

function authorized(req:Request){const secret=process.env.CRON_SECRET;return Boolean(secret&&req.headers.get('authorization')==='Bearer '+secret)}
export async function GET(req:Request){
  if(!authorized(req))return NextResponse.json({error:'Não autorizado.'},{status:401});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY,locationId=process.env.GHL_LOCATION_ID;
  if(!url||!key||!locationId)return NextResponse.json({error:'configuration_unavailable'},{status:503});
  let token:string;try{token=await getLocationAccessToken(locationId)}catch{return NextResponse.json({ok:false,error:'location_token_unavailable'},{status:503})}
  const db=createClient(url,key,{auth:{persistSession:false}});
  const {data:leads,error}=await db.from('leads').select('id,business_id,ghl_contact_id,ghl_location_id,last_reply_at,created_at')
    .eq('ghl_location_id',locationId).eq('automation_track','meulocal_acquisition').not('ghl_contact_id','is',null)
    .is('opt_out_at',null).in('lifecycle_stage',['lead','mql','conversation','nurture']).order('created_at',{ascending:false}).limit(100);
  if(error)return NextResponse.json({error:'lead_lookup_failed'},{status:503});
  let checked=0,replied=0,failed=0;const states:Record<string,number>={explicit_refusal:0,common_reply:0,inconclusive:0};
  for(const lead of leads||[]){
    try{
      if(lead.ghl_location_id!==locationId||!lead.ghl_contact_id)throw new Error('wrong_location');
      const conversationId=await findOperationalConversation({token,locationId,contactId:lead.ghl_contact_id});
      if(!conversationId){checked++;continue}
      const messages=await getOperationalConversationMessages({token,conversationId,limit:50});
      checked++;
      const result=await reconcileAcquisitionMessages(db,{scope:{locationId,contactId:lead.ghl_contact_id},messages,since:lead.created_at,conversationId,source:'highlevel_poll'});
      if(result.stopped)replied++;
      for(const state of result.states)states[state]++;
    }catch{failed++}
  }
  return NextResponse.json({ok:failed===0,checked,replied,failed,states},{status:failed?503:200});
}
