const {test}=require('node:test');const assert=require('node:assert/strict');const load=require('./test-loader.cjs')();
const locationId='uNh3KsM7WFuLeTN8Q583',lead={externalId:'google_places:SYNTHETIC_PLACE',name:'SYNTHETIC business',address:'SYNTHETIC address'};
function db(rows,error=null){const filters=[];const q={select(){return q},eq(k,v){filters.push([k,v]);return q},limit(){return q},in(){return q},then(a,b){return Promise.resolve({data:rows,error}).then(a,b)}};return {filters,from(){return q}}}
test('read-only eligibility is fail closed for missing history and GHL permission errors',async()=>{
 const {assessProspectEligibility}=load('lib/agents/prospect-eligibility.ts');const missing=await assessProspectEligibility({lead,locationId});assert.equal(missing.status,'NOT_VERIFIED');assert.equal(missing.contactAllowed,false);
 for(const status of [401,403,404,429,502]){const d=db([{id:'SYNTHETIC_B',google_place_id:'SYNTHETIC_PLACE',name:lead.name,address:lead.address,ghl_contact_id:'SYNTHETIC_C',ghl_location_id:locationId}]);const r=await assessProspectEligibility({lead,locationId,db:d,token:'SYNTHETIC_TOKEN',fetchImpl:async(url,init)=>{assert.equal(init.method,'GET');assert.match(url,/contacts\/SYNTHETIC_C/);return new Response('',{status})}});assert.equal(r.contactAllowed,false);assert.equal(r.ghlStatus,'HTTP_'+status);assert.ok(d.filters.some(([k,v])=>k==='ghl_location_id'&&v===locationId))}
});
test('normalized identity, opt-out and mismatched location never release outreach',async()=>{
 const {assessProspectEligibility}=load('lib/agents/prospect-eligibility.ts');const row={id:'SYNTHETIC_B',google_place_id:'OTHER',name:' SYNTHETIC BUSINESS ',address:'synthetic address',status:'lost',ghl_contact_id:'SYNTHETIC_C',ghl_location_id:locationId};const d=db([row]);const r=await assessProspectEligibility({lead,locationId,db:d});assert.equal(r.status,'BLOCKED');assert.ok(r.reasons.includes('existing_business'));
 const cross=await assessProspectEligibility({lead,locationId,db:db([{...row,ghl_location_id:'OTHER'}]),token:'SYNTHETIC',fetchImpl:()=>{throw Error('must_not_read_cross_tenant')}});assert.equal(cross.status,'NOT_VERIFIED');
});
