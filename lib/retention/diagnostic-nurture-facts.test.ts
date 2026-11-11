import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {decideFromVerifiedFacts,type Facts} from './diagnostic-nurture-facts';
const clock='2026-10-16T15:00:00Z';
const base:Facts={
 lead:{id:'lead',business_id:'business',email:'a@example.com',whatsapp:'+5511999999999',consent_email:true,consent_whatsapp:true,opt_out_at:null,last_reply_at:null,ghl_contact_id:'contact',ghl_location_id:'location',lifecycle_stage:'lead'},
 business:{id:'business',source:'inbound',status:'diagnosed'},
 diagnostic:{id:'diag',business_id:'business',created_at:'2026-10-16T14:00:00Z'},
 accountStatuses:[],ledger:[],
 provider:{contactId:'contact',locationId:'location',ownerVerified:true,emailDnd:false,whatsappDnd:false,emailOptOut:false,whatsappOptOut:false,stopAt:null,replyAt:null,checkedAt:'2026-10-16T14:59:30Z'},
 diagnosticDelivery:{confirmed:true,verifiedAt:'2026-10-16T14:50:00Z'}
};
test('read-only verified facts yield review, never send',()=>{
 assert.equal(decideFromVerifiedFacts(base,clock).status,'review_required');
});
test('paid or unknown financial state fail closed',()=>{
 assert.equal(decideFromVerifiedFacts({...base,accountStatuses:['active']},clock).status,'blocked');
 assert.equal(decideFromVerifiedFacts({...base,accountStatuses:['pending']},clock).status,'paused');
});
test('identity and permission freshness matter',()=>{
 assert.equal(decideFromVerifiedFacts({...base,provider:null},clock).status,'paused');
 assert.equal(decideFromVerifiedFacts({...base,provider:{...base.provider!,checkedAt:'2026-10-16T14:30:00Z'}},clock).status,'paused');
 assert.equal(decideFromVerifiedFacts({...base,provider:{...base.provider!,contactId:'wrong'}},clock).status,'blocked');
});
test('reply STOP or pending attempt stop cadence',()=>{
 assert.equal(decideFromVerifiedFacts({...base,lead:{...base.lead,opt_out_at:clock}},clock).status,'blocked');
 assert.equal(decideFromVerifiedFacts({...base,provider:{...base.provider!,replyAt:clock}},clock).status,'paused');
 assert.equal(decideFromVerifiedFacts({...base,ledger:[{stage:'d0',status:'uncertain'}]},clock).status,'paused');
});
test('outbound and delivery without proof cannot enter',()=>{
 assert.equal(decideFromVerifiedFacts({...base,business:{...base.business,source:'outbound'}},clock).status,'blocked');
 assert.equal(decideFromVerifiedFacts({...base,diagnosticDelivery:null},clock).status,'paused');
});
