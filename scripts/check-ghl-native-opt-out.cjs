// SYNTHETIC fixtures only. No HTTP, credentials or GHL mutations.
const assert=require('node:assert/strict');
const {test}=require('node:test');
const load=require('./opt-out-test-loader.cjs')();
const {prepareNativeOptOut,validateNativeRemovalEvidence}=load('lib/ghl-native-opt-out.ts');
const scope={locationId:'uNh3KsM7WFuLeTN8Q583',contactId:'SYNTHETIC-contact',leadId:'SYNTHETIC-lead'};
const targets=['bb6f4a2b-46d7-4e23-9c99-176461551583','f4500c60-e33d-41f5-a461-c146662e226e'];
const now=()=>new Date('2026-10-13T12:00:00Z');
const optOutAt='2026-10-13T11:00:00Z';
function fixture(extra={}){
  const records=[];let claimed=false,claims=0;
  const store={
    claim:async()=>{claims++;if(claimed)return {acquired:false,status:'in_progress',confirmed:[]};claimed=true;return {acquired:true,status:'in_progress',attemptId:'SYNTHETIC-attempt',confirmed:[]};},
    record:async(_,__,record)=>records.push(structuredClone(record))
  };
  return {records,getClaims:()=>claims,args:{scope,source:'opendots',sourceEventRef:'SYNTHETIC:event',intent:'opt_out',store,readLocalOptOut:async()=>({...scope,optOutAt}),now:()=>new Date('2026-10-13T11:58:00Z'),...extra}};
}
function evidence(plan,count){
  return {
    source:'verified_native_adapter',evidenceRef:'SYNTHETIC:durable-native-proof',correlationMethod:'verified_execution_link',
    correlationId:plan.correlationId,attemptId:plan.attemptId,locationId:scope.locationId,contactId:scope.contactId,
    blockingWorkflowId:'SYNTHETIC-blocking-workflow',
    actions:targets.map((workflowId,i)=>({workflowId,executionId:'SYNTHETIC-execution',actionLogId:'SYNTHETIC-action-'+i,succeeded:true,completedAt:'2026-10-13T11:59:00Z'})),
    absence:{complete:true,observedAt:now().toISOString(),workflows:targets.map((workflowId,i)=>({workflowId,activeExecutionIds:[],evidenceRef:'SYNTHETIC:absence-'+i}))},
    // Optional historical context; never a timestamp required to invoke removal.
    enrollmentsBefore:targets.slice(0,count)
  };
}
const binding={locationId:scope.locationId,blockingWorkflowId:'SYNTHETIC-blocking-workflow',evidenceRef:'SYNTHETIC:config-proof',published:true,trigger:'contact_tag_added',tag:'meulocal:opt-out-comercial',targetWorkflowIds:targets,removalScope:'specific_workflows'};
test('all supported origins prepare a stable correlation, preserve local refusal and remain blocked',async()=>{
  const ids=[];
  for(const source of ['ghl_webhook','ghl_poll','opendots','rcia']){
    const f=fixture({source});const result=await prepareNativeOptOut(f.args);
    assert.equal(result.synchronized,false);assert.equal(result.status,'blocked');assert.equal(result.plan.dispatchAllowed,false);
    assert.equal(result.plan.tag,'meulocal:opt-out-comercial');assert.deepEqual(result.plan.targetWorkflowIds,targets);
    assert.equal(result.plan.eventOrigin,source.startsWith('ghl_')?'ghl':'meulocal');ids.push(result.plan.correlationId);
    assert.equal(f.records.at(-1).error,'native_dispatch_not_verified');assert.equal(f.records.at(-1).evidenceRef,result.plan.auditRef);assert.ok(result.plan.auditRef.endsWith(':SYNTHETIC:event'));
  }
  assert.equal(new Set(ids).size,1);
});
test('missing persistence, wrong mapping, unclassified reply and callback cannot prepare native commands',async()=>{
  for(const extra of [{readLocalOptOut:async()=>null},{readLocalOptOut:async()=>({...scope,optOutAt:null})},{readLocalOptOut:async()=>({...scope,contactId:'other',optOutAt})},{intent:'replied'},{source:'ghl_native_receipt'},{sourceEventRef:''}]){
    const f=fixture(extra);await assert.rejects(prepareNativeOptOut(f.args));assert.equal(f.getClaims(),0);
  }
});
test('wrong tenant is rejected before a read or a ledger claim',async()=>{
  const f=fixture({scope:{...scope,locationId:'other-location'},readLocalOptOut:async()=>{throw Error('must not read')}});
  await assert.rejects(prepareNativeOptOut(f.args),/native_scope_unverified/);assert.equal(f.getClaims(),0);
});
test('claim serialization stops concurrent commands and never trusts a previous synchronized flag',async()=>{
  const f=fixture();const results=await Promise.all([prepareNativeOptOut(f.args),prepareNativeOptOut(f.args)]);
  assert.equal(results.filter(r=>r.plan).length,1);assert.equal(f.records.length,1);assert.ok(results.every(r=>r.synchronized===false));
  f.args.store.claim=async()=>({acquired:false,status:'synchronized',confirmed:[]});
  assert.equal((await prepareNativeOptOut(f.args)).synchronized,false);
});
test('correlation separates identical contact IDs in different lead mappings and refusal times',async()=>{
  const a=await prepareNativeOptOut(fixture().args);
  const nextAt='2026-10-13T11:01:00Z';
  const b=await prepareNativeOptOut(fixture({readLocalOptOut:async()=>({...scope,optOutAt:nextAt})}).args);
  const nextScope={...scope,leadId:'SYNTHETIC-other-lead'};
  const c=await prepareNativeOptOut(fixture({scope:nextScope,readLocalOptOut:async()=>({...nextScope,optOutAt})}).args);
  assert.notEqual(a.plan.correlationId,b.plan.correlationId);assert.notEqual(a.plan.correlationId,c.plan.correlationId);
});
test('audit failure and an existing API receipt do not produce a dispatchable plan',async()=>{
  const f=fixture();f.args.store.record=async()=>{throw Error('audit unavailable')};await assert.rejects(prepareNativeOptOut(f.args));
  const g=fixture();g.args.store.claim=async()=>({acquired:true,status:'in_progress',attemptId:'SYNTHETIC-attempt',confirmed:[{workflowId:targets[0],eventStartTime:'2026-10-10T12:00:00Z'}]});
  assert.equal((await prepareNativeOptOut(g.args)).plan,undefined);assert.equal(g.records.at(-1).confirmed.length,1);
});
test('zero, one and two previous enrollments require both native actions and complete posterior absence',async()=>{
  const {plan}=await prepareNativeOptOut(fixture().args);
  for(const count of [0,1,2])assert.equal(validateNativeRemovalEvidence(plan,binding,evidence(plan,count),now()),'SYNTHETIC:durable-native-proof');
});
test('HTTP acceptance, a tag, untrusted payload and uncorrelated logs never prove removal',async()=>{
  const {plan}=await prepareNativeOptOut(fixture().args);
  for(const proof of [{status:200,tags:[plan.tag]},evidence(plan,2)]){
    if(proof.actions)proof.correlationMethod='time_window_only';
    assert.throws(()=>validateNativeRemovalEvidence(plan,binding,proof,now()));
  }
  for(const field of ['source','correlationId','attemptId','locationId','contactId','blockingWorkflowId','evidenceRef']){
    const proof=evidence(plan,2);proof[field]='wrong';assert.throws(()=>validateNativeRemovalEvidence(plan,binding,proof,now()));
  }
});
test('partial failure, reentry, incomplete pagination and stale proof stay unconfirmed',async()=>{
  const {plan}=await prepareNativeOptOut(fixture().args);
  for(const mutate of [p=>p.actions[1].succeeded=false,p=>p.actions.pop(),p=>p.absence.workflows[1].activeExecutionIds.push('SYNTHETIC-reentry'),p=>p.absence.complete=false,p=>p.absence.workflows.pop(),p=>p.absence.observedAt='2026-10-13T11:00:00Z',p=>p.actions[0].completedAt='2026-10-13T11:57:00Z',p=>p.actions[1].actionLogId=p.actions[0].actionLogId,p=>p.actions[1].executionId='SYNTHETIC-other-run']){
    const proof=evidence(plan,2);mutate(proof);assert.throws(()=>validateNativeRemovalEvidence(plan,binding,proof,now()));
  }
});
test('draft, broad scope, wrong tag, duplicate target and another location invalidate the binding',async()=>{
  const {plan}=await prepareNativeOptOut(fixture().args);
  for(const extra of [{published:false},{removalScope:'all_workflows'},{tag:'other'},{locationId:'other'},{targetWorkflowIds:[targets[0],targets[0]]},{blockingWorkflowId:targets[0]},{evidenceRef:''}]){
    const proof=evidence(plan,2);if(extra.blockingWorkflowId)proof.blockingWorkflowId=extra.blockingWorkflowId;
    assert.throws(()=>validateNativeRemovalEvidence(plan,{...binding,...extra},proof,now()));
  }
});
