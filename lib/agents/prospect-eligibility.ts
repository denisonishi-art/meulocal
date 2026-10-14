import type {SupabaseClient} from '@supabase/supabase-js';
import type {BusinessLead} from './prospect-intelligence';
const LOCATION='uNh3KsM7WFuLeTN8Q583';
const normalize=(value:unknown)=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]/g,'').toLowerCase();
export async function assessProspectEligibility(args:{lead:Pick<BusinessLead,'externalId'|'name'|'address'>;locationId:string;db?:SupabaseClient;token?:string;fetchImpl?:typeof fetch}){
 const result={externalId:args.lead.externalId,status:'NOT_VERIFIED' as 'NOT_VERIFIED'|'BLOCKED',contactAllowed:false as const,localStatus:'NOT_VERIFIED',ghlStatus:'NOT_VERIFIED',reasons:[] as string[],checkedAt:new Date().toISOString()};
 if(args.locationId!==LOCATION){result.reasons.push('location_not_authorized');return result}
 if(!args.db){result.reasons.push('local_history_unavailable');return result}
 try{
  const {data,error}=await args.db.from('businesses').select('id,google_place_id,name,address,status,ghl_contact_id,ghl_location_id').eq('ghl_location_id',args.locationId).limit(200);
  if(error||!Array.isArray(data)||data.some(b=>b.ghl_location_id!==args.locationId)){result.reasons.push('local_history_unverified');return result}
  const placeId=args.lead.externalId.replace(/^(?:google_places:|google:|places\/)/,'');
  const matches=data.filter(b=>b.google_place_id===placeId||(args.lead.address&&normalize(b.name)===normalize(args.lead.name)&&normalize(b.address)===normalize(args.lead.address)));
  result.localStatus=data.length===200?'PARTIAL_LIMIT_REACHED':'LOCATION_SCOPED_CHECK';
  if(!matches.length){
   result.reasons.push('no_authorized_contact_mapping');
   // Name-only discovery is a read-only candidate check, never proof of no duplicates,
   // consent, channel permission or contact ownership.
   if(!args.token){result.reasons.push('ghl_credential_unavailable');return result}
   const query=args.lead.name.trim();
   if(query.length<3||query.length>100){result.reasons.push('prospect_name_not_searchable');return result}
   try{
    const response=await (args.fetchImpl||fetch)('https://services.leadconnectorhq.com/contacts/search',{method:'POST',headers:{Authorization:'Bearer '+args.token,Version:'2021-07-28',Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({locationId:args.locationId,query,page:1,pageLimit:20}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(3000)});
    if(!response.ok){result.ghlStatus='SEARCH_HTTP_'+response.status;result.reasons.push('ghl_search_unavailable');return result}
    const body=await response.json();
    if(!Array.isArray(body?.contacts)||body.contacts.length>20||body.contacts.some((c:any)=>c?.locationId!==args.locationId)){
     result.ghlStatus='SEARCH_CONTRACT_UNVERIFIED';result.reasons.push('ghl_search_contract_unverified');return result
    }
    result.ghlStatus='SEARCH_READ_VERIFIED';
    const possible=body.contacts.filter((c:any)=>normalize(c.companyName||c.name||[c.firstName,c.lastName].filter(Boolean).join(' '))===normalize(args.lead.name));
    if(possible.length){result.status='BLOCKED';result.reasons.push('possible_existing_ghl_contact');if(possible.some((c:any)=>c.dnd===true||Object.values(c.dndSettings||{}).some((d:any)=>d?.status==='active')))result.reasons.push('ghl_dnd')}
    else result.reasons.push('no_exact_name_match_in_bounded_ghl_search');
    result.reasons.push('contact_identifiers_global_history_consent_and_channel_NOT_VERIFIED');
   }catch{result.ghlStatus='SEARCH_TRANSPORT_UNAVAILABLE';result.reasons.push('ghl_search_unavailable')}
   return result
  }
  result.status='BLOCKED';result.reasons.push('existing_business');
  if(matches.length>1){result.reasons.push('multiple_business_matches');return result}
  for(const business of matches){
   const {data:leads,error:leadError}=await args.db.from('leads').select('id,ghl_location_id,opt_out_at,last_reply_at,lifecycle_stage').eq('business_id',business.id).eq('ghl_location_id',args.locationId).limit(50);
   if(leadError||!Array.isArray(leads)){result.reasons.push('lead_history_unverified')}else{
    if(leads.some(l=>l.opt_out_at))result.reasons.push('local_opt_out');
    if(leads.some(l=>l.last_reply_at))result.reasons.push('prior_reply');
    if(leads.some(l=>['conversation','customer','lost'].includes(l.lifecycle_stage)))result.reasons.push('commercial_history_blocks_new_contact');
   }
   if(!args.token||!business.ghl_contact_id){result.reasons.push('ghl_credential_or_mapping_unavailable');continue}
   const response=await (args.fetchImpl||fetch)('https://services.leadconnectorhq.com/contacts/'+encodeURIComponent(business.ghl_contact_id),{method:'GET',headers:{Authorization:'Bearer '+args.token,Version:'v3',Accept:'application/json'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(3000)});
   if(!response.ok){result.ghlStatus='HTTP_'+response.status;continue}
   const body=await response.json();const contact=body.contact;
   if(!contact||contact.id!==business.ghl_contact_id||contact.locationId!==args.locationId){result.ghlStatus='SCOPE_OR_CONTRACT_UNVERIFIED';continue}
   result.ghlStatus='CONTACT_READ_VERIFIED';if(contact.dnd===true||Object.values(contact.dndSettings||{}).some((d:any)=>d?.status==='active'))result.reasons.push('ghl_dnd');
   // Contact read does not establish workflow membership, consent, channel eligibility or history completeness.
   result.reasons.push('conversations_workflows_channel_and_legal_basis_NOT_VERIFIED');
  }
 }catch{result.reasons.push('history_transport_or_contract_unavailable')}
 result.reasons=[...new Set(result.reasons)];return result;
}
