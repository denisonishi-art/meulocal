import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {getLocationAccessToken,removeOperationalTags} from '@/lib/highlevel-operational';

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
  if(process.env.GHL_LOCATION_ID&&locationId!==process.env.GHL_LOCATION_ID)return NextResponse.json({error:'wrong_location'},{status:403});
  const db=createClient(url,key,{auth:{persistSession:false}});
  const {data:lead,error}=await db.from('leads').select('id,business_id').eq('ghl_location_id',locationId).eq('ghl_contact_id',contactId).maybeSingle();
  if(error)return NextResponse.json({error:'lookup_failed'},{status:500});
  if(!lead)return NextResponse.json({error:'contact_not_found'},{status:404});
  // Record the refusal locally first: remote GHL outages must not keep acquisition enabled.
  const now=new Date().toISOString();
  const updates=await Promise.all([
    db.from('leads').update({lifecycle_stage:'lost',opt_out_at:now,next_action_at:null,updated_at:now}).eq('id',lead.id),
    db.from('automation_enrollments').update({status:'cancelled',next_run_at:null,completed_at:now}).eq('lead_id',lead.id).eq('track','meulocal_acquisition').eq('status','active'),
    db.from('businesses').update({status:'lost',updated_at:now}).eq('id',lead.business_id)
  ]);
  if(updates.some(result=>result.error))return NextResponse.json({error:'persistence_failed'},{status:500});
  // Remote synchronization is still missing verified enrollment lookups and removals.
  // Never return synchronized:true based on an environment flag or tag removal alone.
  return NextResponse.json({ok:false,localOptOutRecorded:true,error:'ghl_workflow_unenrollment_not_implemented'},{status:503});
}
