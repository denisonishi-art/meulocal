import {buildTop3Report,fetchGooglePlaceDetail,verifiedReportLink,asksForComparativeAnalysis,languageSchoolCandidate,LocalComparison} from './hermes-comparative-report';

export type ReportReady={status:'ready';url:string;businessName:string;competitorCount:number;observedAt:string};
export type ReportUnavailable={status:'unavailable'};
export type ReportDecision=ReportReady|ReportUnavailable|null;
const uuid=/^[0-9a-f-]{36}$/i;
const DAY=86400000;

function snapshotValid(snapshot:any):snapshot is LocalComparison{
 return snapshot?.version==='meulocal_top3_v1'&&snapshot?.radiusMeters===3000&&
 typeof snapshot?.business?.id==='string'&&Array.isArray(snapshot?.competitors)&&
 snapshot.competitors.length>=1&&snapshot.competitors.length<=3&&
 Number.isFinite(Date.parse(snapshot?.expiresAt))&&Date.parse(snapshot.expiresAt)>Date.now()&&
 snapshot.competitors.every((c:any)=>typeof c.id==='string'&&Number.isFinite(c.distanceKm)&&c.distanceKm<=3);
}
function ready(token:string,snapshot:LocalComparison):ReportReady{
 return {status:'ready',url:verifiedReportLink(token),businessName:snapshot.business.name,
  competitorCount:snapshot.competitors.length,observedAt:snapshot.observedAt};
}
async function storedReport(db:any,diagnosticId:string,placeId:string){
 const {data,error}=await db.from('prospect_comparison_reports')
  .select('google_place_id,snapshot,expires_at').eq('diagnostic_id',diagnosticId).maybeSingle();
 if(error)throw Error('comparison_read_unavailable');
 if(data&&data.google_place_id===placeId&&snapshotValid(data.snapshot))return data.snapshot as LocalComparison;
 return null;
}
export async function prepareVerifiedComparison(db:any,diagnostic:{
 id:string;place_id:string;business_name:string;public_token:string;niche?:string|null
},options:{apiKey?:string;fetchImpl?:typeof fetch;details?:any;now?:Date}={}):Promise<ReportReady>{
 if(!uuid.test(diagnostic.id)||!uuid.test(diagnostic.public_token))throw Error('invalid_diagnostic_identity');
 const existing=await storedReport(db,diagnostic.id,diagnostic.place_id);
 if(existing)return ready(diagnostic.public_token,existing);
 const apiKey=options.apiKey||process.env.GOOGLE_PLACES_API_KEY;
 if(!apiKey)throw Error('google_api_not_configured');
 const snapshot=await buildTop3Report({placeId:diagnostic.place_id,niche:diagnostic.niche||diagnostic.business_name,
  businessName:diagnostic.business_name,apiKey,fetchImpl:options.fetchImpl,details:options.details,now:options.now});
 // A concurrent request can build the same report; unique diagnostic_id still
 // fences accidental duplicates and retries are safe.
 const {error}=await db.from('prospect_comparison_reports').upsert({
  diagnostic_id:diagnostic.id,google_place_id:diagnostic.place_id,
  snapshot,observed_at:snapshot.observedAt,expires_at:snapshot.expiresAt,updated_at:new Date().toISOString()
 },{onConflict:'diagnostic_id'});
 if(error)throw Error('comparison_persistence_failed');
 return ready(diagnostic.public_token,snapshot);
}

/** Approved-manual reply only. No first contact, no consent guessing, no GHL
 * mutations, no direct send. The signed bridge may attach a verified report. */
export async function prepareAnalysisForApprovedReply(db:any,input:{
 leadId:string;contactId:string;message:string
},options:{apiKey?:string;fetchImpl?:typeof fetch}={}):Promise<ReportDecision>{
 if(!asksForComparativeAnalysis(input.message))return null;
 try{
  const {data:lead,error:leadError}=await db.from('leads')
   .select('id,business_id,prospect_diagnostic_id,ghl_contact_id,opt_out_at,lifecycle_stage')
   .eq('id',input.leadId).maybeSingle();
  if(leadError||!lead||lead.ghl_contact_id!==input.contactId||lead.opt_out_at||
   ['customer','lost'].includes(lead.lifecycle_stage))return null;
  const [p,o,b]=await Promise.all([
   db.from('manual_prospect_permissions').select('place_id,name,message,contact_id,stage,created_at')
    .eq('lead_id',input.leadId).eq('contact_id',input.contactId)
    .order('created_at',{ascending:false}).limit(1).maybeSingle(),
   db.from('outreach_events').select('id,created_at').eq('lead_id',input.leadId)
    .eq('event_type','sent').order('created_at',{ascending:false}).limit(1).maybeSingle(),
   db.from('businesses').select('id,name,google_place_id,address').eq('id',lead.business_id).maybeSingle()
  ]);
  if(p.error||o.error||b.error||!p.data||!o.data||!b.data)return null;
  const permission=p.data;
  // Only an approved first-contact message offering the analysis authorizes a
  // positive response to receive its report. A bare "sim" otherwise means nothing.
  if(permission.stage!=='ready'||!permission.message.includes('MeuLocal')||
    !/an[aá]lise gratuita/i.test(permission.message)||
    !permission.place_id||permission.place_id!==b.data.google_place_id)return null;
  const sentAt=Date.parse(o.data.created_at),approvedAt=Date.parse(permission.created_at);
  // The most recent outbound must belong to THIS specific approved offer.
  // A generic 'sim' to a later/unrelated sales conversation cannot release a link.
  if(!Number.isFinite(sentAt)||!Number.isFinite(approvedAt)||sentAt<approvedAt||
    sentAt-approvedAt>3600000||Date.now()-sentAt>30*DAY||sentAt>Date.now()+120000)return null;
  const {data:existing,error:existingError}=await db.from('prospect_diagnostics')
   .select('id,place_id,business_name,public_token,niche').eq('place_id',permission.place_id).maybeSingle();
  if(existingError)return {status:'unavailable'};
  let diagnostic=existing;
  let details:any;
  if(!diagnostic){
   const apiKey=options.apiKey||process.env.GOOGLE_PLACES_API_KEY;
   if(!apiKey)return {status:'unavailable'};
   details=await fetchGooglePlaceDetail(permission.place_id,apiKey,options.fetchImpl);
   const rating=details.rating,reviewCount=details.userRatingCount;
   const reviewScore=Math.min(100,Math.round((reviewCount/300)*100));
   const ratingScore=Math.max(0,Math.min(100,Math.round(((rating-3)/2)*100)));
   const score=Math.round(reviewScore*0.7+ratingScore*0.3);
   const niche=languageSchoolCandidate(permission.name)?'escola de idiomas':String(details.primaryType).replace(/_/g,' ');
   const {data:prepared,error:prepareError}=await db.rpc('prepare_prospect_diagnostics',{
    p_items:[{id:permission.place_id,name:permission.name,address:details.formattedAddress||b.data.address,
     rating,reviews:reviewCount,score,niche,competitionMode:'local_radius'}]
   });
   if(prepareError||!Array.isArray(prepared?.diagnostics)||prepared.diagnostics.length!==1||
      prepared.diagnostics[0].lead_id!==lead.id)return {status:'unavailable'};
   diagnostic=prepared.diagnostics[0];
  }
  if(!diagnostic||diagnostic.place_id!==permission.place_id)return {status:'unavailable'};
  return await prepareVerifiedComparison(db,diagnostic,{...options,details});
 }catch{
  return {status:'unavailable'};
 }
}
