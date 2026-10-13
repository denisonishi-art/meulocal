import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {MEULOCAL_GHL_LOCATION_ID} from '@/lib/ghl-workflow-removal';
import {createOptOutStore,runOptOutSync} from '@/lib/rcia-opt-out-sync';
import {getLocationAccessToken} from '@/lib/highlevel-operational';

// Internal-only opt-out sync. Configure the shared secret on both deployments before enabling RCIA calls.
export async function POST(request:Request){
  const expected=process.env.MEULOCAL_RCIA_SYNC_SECRET;
  if(!expected||request.headers.get('x-rcia-sync-secret')!==expected)return NextResponse.json({error:'unauthorized'},{status:401});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)return NextResponse.json({error:'database_unavailable'},{status:503});
  let body:unknown;try{body=await request.json()}catch{return NextResponse.json({error:'invalid_json'},{status:400})}
  if(!body||typeof body!=='object')return NextResponse.json({error:'invalid_body'},{status:400});
  const item=body as Record<string,unknown>;
  const locationId=typeof item.locationId==='string'?item.locationId:'';
  const contactId=typeof item.contactId==='string'?item.contactId:'';
  if(!/^[a-zA-Z0-9_-]{5,128}$/.test(locationId)||!/^[a-zA-Z0-9_-]{5,128}$/.test(contactId)||item.intent!=='opt_out')return NextResponse.json({error:'invalid_fields'},{status:400});
  if(!process.env.GHL_LOCATION_ID)return NextResponse.json({error:'location_not_configured'},{status:503});
  if(locationId!==process.env.GHL_LOCATION_ID||locationId!==MEULOCAL_GHL_LOCATION_ID)return NextResponse.json({error:'wrong_location'},{status:403});
  const db=createClient(url,key,{auth:{persistSession:false}});
  const {data:lead,error}=await db.from('leads').select('id,business_id,opt_out_at').eq('ghl_location_id',locationId).eq('ghl_contact_id',contactId).maybeSingle();
  if(error)return NextResponse.json({error:'lookup_failed'},{status:500});
  if(!lead)return NextResponse.json({error:'contact_not_found'},{status:404});
  // Record the refusal locally first: remote GHL outages must not keep acquisition enabled.
  const now=new Date().toISOString();
  const local=await db.from('leads').update({lifecycle_stage:'lost',opt_out_at:lead.opt_out_at||now,next_action_at:null,updated_at:now}).eq('id',lead.id).eq('ghl_location_id',locationId).eq('ghl_contact_id',contactId).select('id').maybeSingle();
  if(local.error||!local.data)return NextResponse.json({ok:false,localOptOutRecorded:false,synchronized:false,error:'persistence_failed'},{status:500});
  const updates=await Promise.all([
    db.from('automation_enrollments').update({status:'cancelled',next_run_at:null,completed_at:now}).eq('lead_id',lead.id).eq('track','meulocal_acquisition').in('status',['active','paused']),
    db.from('businesses').update({status:'lost',updated_at:now}).eq('id',lead.business_id).eq('ghl_location_id',locationId)
  ]);
  const cleanupFailed=updates.some(result=>result.error);
  try{
    // No production provider until membership provenance is verified. Ignore inbound memberships.
    const result=await runOptOutSync({scope:{locationId,contactId,leadId:lead.id},store:createOptOutStore(db),getToken:getLocationAccessToken});
    const synchronized=result.synchronized&&!cleanupFailed;
    return NextResponse.json({ok:synchronized,localOptOutRecorded:true,synchronized,status:result.status,error:cleanupFailed?'local_cleanup_failed':result.error},{status:synchronized?200:503,headers:{'Cache-Control':'no-store'}});
  }catch{
    return NextResponse.json({ok:false,localOptOutRecorded:true,synchronized:false,error:'sync_audit_unavailable'},{status:503});
  }
}
