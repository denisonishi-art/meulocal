import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {decideDiagnosticNurture, type Snapshot} from './diagnostic-nurture';
const base:Snapshot={businessId:'b',leadId:'l',diagnosticSavedAt:'2026-10-01T00:00:00Z',diagnosticDelivered:true,email:'a@example.com',whatsapp:'+5511999999999',emailConsent:true,whatsappConsent:true,emailDnd:false,whatsappDnd:false,emailOptOut:false,whatsappOptOut:false,identityVerified:true,ownershipVerified:true,paymentStatus:'none',repliedAt:null,stoppedAt:null,uncertainDelivery:false,sentStages:[]};
const at=(days:number)=>new Date(Date.parse(base.diagnosticSavedAt)+days*86400000).toISOString();
test('D0 review only, deterministic key',()=>assert.deepEqual(decideDiagnosticNurture(base,at(0)),{status:'review_required',stage:'d0',channel:'email',idempotencyKey:'diagnostic-nurture:b:l:d0'}));
test('cadence respects delay and order',()=>{
 assert.equal(decideDiagnosticNurture({...base,sentStages:['d0']},at(0)).status,'paused');
 assert.equal((decideDiagnosticNurture({...base,sentStages:['d0']},at(1)) as any).stage,'d1');
 assert.equal((decideDiagnosticNurture({...base,sentStages:['d0','d1']},at(3)) as any).stage,'d3');
 assert.equal((decideDiagnosticNurture({...base,sentStages:['d0','d1','d3','d5']},at(7)) as any).stage,'d7');
});
test('paid, STOP, reply and uncertain delivery suppress sends',()=>{
 for(const partial of [{paymentStatus:'active'},{paymentStatus:'pending'},{paymentStatus:'unknown'},{stoppedAt:at(1)},{repliedAt:at(1)},{uncertainDelivery:true}])
  assert.notEqual(decideDiagnosticNurture({...base,...partial} as Snapshot,at(8)).status,'review_required');
});
test('channel authorization fails closed',()=>{
 for(const partial of [{emailDnd:null},{emailOptOut:null},{emailConsent:false},{identityVerified:false},{diagnosticDelivered:false}])
  assert.notEqual(decideDiagnosticNurture({...base,...partial} as Snapshot,at(8)).status,'review_required');
 for(const partial of [{whatsappDnd:null},{whatsappOptOut:true},{whatsappConsent:false},{whatsapp:null}])
  assert.notEqual(decideDiagnosticNurture({...base,sentStages:['d0','d1'],...partial} as Snapshot,at(3)).status,'review_required');
});
test('no duplicates or replay',()=>{
 assert.equal(decideDiagnosticNurture({...base,sentStages:['d0','d0']},at(8)).status,'blocked');
 assert.equal(decideDiagnosticNurture({...base,sentStages:['d0','d1','d3','d5','d7']},at(8)).status,'blocked');
});
