'use strict';
const path=require('node:path');
const {isDeepStrictEqual}=require('node:util');
const QUERY='empresas de aluguel de geradores em São Paulo SP';
const MAX_LIMIT=20;
const BACKEND_SOURCE='https://meulocal.ia.br/api/places/search';
const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
function publicUrl(value,googleOnly=false){
 try{const u=new URL(value);const host=u.hostname.toLowerCase();if(u.protocol!=='https:'||u.username||u.password||u.port||!host.includes('.')||host==='localhost'||/^[\d.]+$/.test(host)||host.endsWith('.local'))return null;
 if(googleOnly&&!(host==='google.com'||host.endsWith('.google.com')||host==='google.com.br'||host.endsWith('.google.com.br')))return null;
 return u;
 }catch{return null}
}
function mapPlaces(places,observedAt){
 if(!(observedAt instanceof Date)||!Number.isFinite(observedAt.getTime())||observedAt.getTime()>Date.now())throw Error('observation_invalid');
 const leads=[],metrics={},seen=new Set(),seenWebsites=new Set();let excluded=0;
 for(const place of places){
  const id=String(place.id||'').trim(),name=String(place.displayName?.text||'').trim();
  const count=place.userRatingCount,rating=place.rating;
  const components=Array.isArray(place.addressComponents)?place.addressComponents:[];
  const inCity=components.some(c=>Array.isArray(c.types)&&(c.types.includes('locality')||c.types.includes('administrative_area_level_2'))&&normalize(c.longText)==='sao paulo');
  const inState=components.some(c=>Array.isArray(c.types)&&c.types.includes('administrative_area_level_1')&&normalize(c.shortText)==='sp');
  const source=publicUrl(place.googleMapsUri,true),website=publicUrl(place.websiteUri);
  const websiteKey=website?.hostname.replace(/^www\./,'');
  const qualifies=Number.isInteger(count)&&count>=0&&count<=50 || Number.isFinite(rating)&&rating>=1&&rating<4.3;
  if(!id||!name||!source||!Number.isInteger(count)||count<0||!inCity||!inState||place.businessStatus!=='OPERATIONAL'||!qualifies||seen.has(id)||websiteKey&&seenWebsites.has(websiteKey)){excluded++;continue}
  seen.add(id);if(websiteKey)seenWebsites.add(websiteKey);
  const externalId='google_places:'+id;
  const evidence=[];
  if(count<=50)evidence.push({signal:'few_reviews',url:source.href,observedAt:observedAt.toISOString(),description:`Google Places informa ${count} avaliações; critério local de pesquisa: até 50, sem comparação presumida com concorrentes.`,verified:true});
  if(Number.isFinite(rating)&&rating>=1&&rating<4.3)evidence.push({signal:'low_rating',url:source.href,observedAt:observedAt.toISOString(),description:`Google Places informa nota ${rating}/5; critério local de pesquisa: abaixo de 4,3.`,verified:true});
  leads.push({externalId,name,segment:'geradores',city:'Sao Paulo',state:'SP',...(website?{website:website.href}:{}),evidence});
  metrics[externalId]={reviewCount:count,sourceUrl:source.href,sourceObservedAt:observedAt.toISOString(),rating:Number.isFinite(rating)?rating:null};
 }
 return {leads,metrics,excluded};
}
function mapBackendPlaces(places,observedAt,job={segment:'geradores',city:'Sao Paulo',state:'SP'}){
 if(!(observedAt instanceof Date)||!Number.isFinite(observedAt.getTime())||observedAt.getTime()>Date.now())throw Error('observation_invalid');
 const leads=[],metrics={},seen=new Set(),sites=new Set();let excluded=0;
 for(const place of places){
  const id=String(place.id||'').trim(),name=String(place.name||'').trim(),count=place.reviewCount,rating=place.rating;
  // The existing projection defaults absent counts to zero. Zero is not evidence.
  const cityObserved=/(?:^|,)\s*sao paulo\s*-\s*sp(?:\s*,|\s*$)/.test(normalize(place.address));
  const website=publicUrl(place.website),site=website?.hostname.replace(/^www\./,'');
  const sourceUrl=publicUrl(place.googleMapsUri,true)?.href||job.sourceUrl||BACKEND_SOURCE;
  const lowRating=Number.isFinite(rating)&&rating>=1&&rating<4.0;
  // A weak rating alone on an established profile is not a compelling reviews-management opportunity.
  // Prefer modest review volumes; retain severe low ratings only with <=200 observed reviews.
  const meaningfulSignal=count<=50||(lowRating&&count<=200);
  if(!id||!name||!cityObserved||place.businessStatus&&place.businessStatus!=='OPERATIONAL'||!Number.isInteger(count)||count<=0||!meaningfulSignal||seen.has(id)||site&&sites.has(site)){excluded++;continue}
  seen.add(id);if(site)sites.add(site);const externalId='google_places:'+id,evidence=[];
  if(count<=50)evidence.push({signal:'few_reviews',url:sourceUrl,observedAt:observedAt.toISOString(),description:`Backend MeuLocal retorna ${count} avaliações de Google Places. Origem: projeção existente; ausência de dados estruturados não comprova status operacional.`,verified:true});
  if(lowRating)evidence.push({signal:'low_rating',url:sourceUrl,observedAt:observedAt.toISOString(),description:`Backend MeuLocal retorna nota ${rating}/5 de Google Places.`,verified:true});
  leads.push({externalId,name,segment:job.segment,city:job.city,state:job.state,address:place.address,...(website?{website:website.href}:{}),evidence});
  metrics[externalId]={reviewCount:count,rating:Number.isFinite(rating)?rating:null,sourceUrl,sourceObservedAt:observedAt.toISOString(),businessStatus:place.businessStatus==='OPERATIONAL'?'OPERATIONAL':'NOT_VERIFIED',structuredLocation:'NOT_VERIFIED'};
 }
 return {leads,metrics,excluded};
}
function createResearchWorker(settings,{fetch=globalThis.fetch}={}){
 if(!settings.apiKey)throw Error('private_key_missing');
 const endpoint=new URL(settings.endpoint);
 const loopback=endpoint.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname);
 const remote=settings.approvedRemoteOrigin==='https://meulocal.ia.br'&&endpoint.protocol==='https:'&&endpoint.origin===settings.approvedRemoteOrigin;
 if(!loopback&&!remote)throw Error('loopback_or_approved_https_endpoint_required');
 if(endpoint.pathname!=='/api/agents/prospecting'||endpoint.search||endpoint.hash||endpoint.username||endpoint.password)throw Error('qualification_endpoint_invalid');
 const repoRoot=path.resolve(settings.repoRoot);
 const backend=settings.sourceProvider==='meulocal_backend';
 const sourceEndpoint=settings.sourceEndpoint||BACKEND_SOURCE;
 if(![BACKEND_SOURCE,'https://meulocal.ia.br/api/agents/prospecting/discover'].includes(sourceEndpoint))throw Error('source_endpoint_denied');
 const segment=settings.segment||'geradores',city=settings.city||'Sao Paulo',state=settings.state||'SP';
 const query=segment==='geradores'?QUERY:`${segment} em ${city} ${state}`;
 if(settings.sourceProvider&&!['google_places','meulocal_backend'].includes(settings.sourceProvider))throw Error('source_provider_invalid');
 const shared=path.resolve(settings.sharedRoot||path.join(__dirname,'shared'));
 const {rankLeads}=require(path.join(shared,'prospect-intelligence.cjs'));
 const {buildConsultativeApproach}=require(path.join(shared,'consultative-approach.cjs'));
 let running=false;
 async function jsonRequest(url,init,label){
  let response;try{response=await fetch(url,{...init,redirect:'error',signal:AbortSignal.timeout(20000)})}catch{throw Error(label+'_transport_failed')}
  if(!response.ok)throw Error(label+'_http_'+response.status);
  try{return await response.json()}catch{throw Error(label+'_invalid_json')}
 }
 async function research({limit=MAX_LIMIT}={}){
  if(!Number.isInteger(limit)||limit<1||limit>MAX_LIMIT)throw Error('limit_1_to_20_required');
  if(running)throw Error('run_in_progress');
  if(!backend&&!settings.placesKey)throw Error('source_not_configured');
  running=true;
  try{
   const source=await jsonRequest(backend?sourceEndpoint:'https://places.googleapis.com/v1/places:searchText',backend?{method:'POST',headers:{'Content-Type':'application/json',...(sourceEndpoint!==BACKEND_SOURCE?{'x-prospector-api-key':settings.apiKey}:{})},body:JSON.stringify({query,limit})}:{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':settings.placesKey,'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress,places.addressComponents,places.businessStatus,places.websiteUri,places.googleMapsUri,places.rating,places.userRatingCount'},body:JSON.stringify({textQuery:QUERY,languageCode:'pt-BR',regionCode:'BR',pageSize:20})},'source');
   if(!Array.isArray(source.places)&&source.places!==undefined)throw Error('source_schema_invalid');
   if(backend&&!Array.isArray(source.places))throw Error('source_schema_invalid');
   const sourceDate=sourceEndpoint===BACKEND_SOURCE?new Date():new Date(source.observedAt);
   if(backend&&sourceEndpoint!==BACKEND_SOURCE&&(source.contract!=='meulocal.places.v1'||source.source!=='google_places'||!Number.isFinite(sourceDate.getTime())||sourceDate.getTime()>Date.now()||Date.now()-sourceDate.getTime()>300000||!isDeepStrictEqual(source.actions,{crmWrite:false,outboundMessages:false,humanReviewRequired:true})))throw Error('source_confirmation_invalid');
   const observed=source.places||[];
   const mapped=(backend?mapBackendPlaces:mapPlaces)(observed.slice(0,backend?limit:observed.length),sourceDate,{segment,city,state,sourceUrl:sourceEndpoint});
   const leads=mapped.leads.slice(0,limit);
   const job={segment,city,state,requestedLimit:limit,mode:'research_only'};
   const response=await jsonRequest(endpoint.href,{method:'POST',headers:{'Content-Type':'application/json','x-prospector-api-key':settings.apiKey},body:JSON.stringify({...job,leads})},'qualification');
   const actions={crmWrite:false,outboundMessages:false,humanReviewRequired:true};
   if(response.mode!=='research_only'||!isDeepStrictEqual(response.job,job)||!isDeepStrictEqual(response.actions,actions)||!isDeepStrictEqual(response.assessments,rankLeads(leads)))throw Error('qualification_confirmation_invalid');
   const drafts=response.assessments.map(a=>({externalId:a.lead.externalId,approvalStatus:'pending_review',draft:buildConsultativeApproach({businessName:a.lead.name,niche:segment==='geradores'?'aluguel de geradores':segment,region:city,...mapped.metrics[a.lead.externalId]})}));
   const reference=leads.map(l=>({externalId:l.externalId,reviewCount:mapped.metrics[l.externalId]?.reviewCount,rating:mapped.metrics[l.externalId]?.rating}));
   return {comparison:{kind:'same_query_sample',competitorRelationship:'NOT_VERIFIED',observations:reference},eligibility:response.eligibility||leads.map(l=>({externalId:l.externalId,status:'NOT_VERIFIED',reason:'history_not_checked'})),mode:'research_only',assessments:response.assessments,drafts,actions,provider:backend?'meulocal_backend':'google_places',providerRequests:1,sourceReturned:observed.length,evaluated:backend?Math.min(observed.length,limit):observed.length,metrics:Object.fromEntries(leads.map(l=>[l.externalId,mapped.metrics[l.externalId]])),excluded:mapped.excluded,limit,commercialEligibility:'NOT_VERIFIED',warning:'Qualificado para revisão. Segmento, decisor, duplicidade no CRM e opt-out precisam de conferência humana. Não é autorização de contato.'};
  }finally{running=false}
 }
 return {research};
}
module.exports={createResearchWorker,mapPlaces,mapBackendPlaces,QUERY,MAX_LIMIT};
