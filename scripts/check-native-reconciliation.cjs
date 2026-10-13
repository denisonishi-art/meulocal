const assert=require('node:assert/strict');
const {test}=require('node:test');
const loader=require('./opt-out-test-loader.cjs');
const {prepareNativeOptOut,persistNativeOptOutIntent,reconcileNativeOptOutEvidence}=loader()('lib/ghl-native-opt-out.ts');
const scope={locationId:'uNh3KsM7WFuLeTN8Q583',contactId:'SYNTHETIC-contact',leadId:'SYNTHETIC-lead'};
const ids=['bb6f4a2b-46d7-4e23-9c99-176461551583','f4500c60-e33d-41f5-a461-c146662e226e'];
const now=new Date('2026-10-13T12:00:00Z');
async function fixture(){
 const {plan}=await prepareNativeOptOut({scope,source:'rcia',sourceEventRef:'SYNTHETIC:event',intent:'opt_out',now:()=>new Date('2026-10-13T11:58:00Z'),readLocalOptOut:async()=>({...scope,optOutAt:'2026-10-13T11:00:00Z'}),store:{claim:async()=>({acquired:true,status:'in_progress',attemptId:'SYNTHETIC-attempt',confirmed:[]}),record:async()=>{}}});
 const binding={locationId:scope.locationId,blockingWorkflowId:'SYNTHETIC-blocker',evidenceRef:'SYNTHETIC:binding',published:true,trigger:'contact_tag_added',tag:plan.tag,targetWorkflowIds:ids,removalScope:'specific_workflows'};
 const evidence={source:'verified_native_adapter',evidenceRef:'SYNTHETIC:proof',correlationMethod:'verified_execution_link',locationId:scope.locationId,contactId:scope.contactId,blockingWorkflowId:binding.blockingWorkflowId,correlationId:plan.correlationId,attemptId:plan.attemptId,
  actions:ids.map((workflowId,i)=>({workflowId,executionId:'SYNTHETIC-execution',actionLogId:'SYNTHETIC-action-'+i,succeeded:true,completedAt:'2026-10-13T11:59:00Z'})),
  absence:{complete:true,observedAt:now.toISOString(),workflows:ids.map(workflowId=>({workflowId,activeExecutionIds:[],evidenceRef:'SYNTHETIC:absence'}))}};
 return {plan,binding,evidence};
}
test('native intent persists the exact plan and binding before any late reconciliation',async()=>{
 const {plan,binding}=await fixture();const calls=[];await persistNativeOptOutIntent({rpc:async(name,args)=>{calls.push({name,args});return {data:true}}},plan,binding);
 assert.equal(calls.length,1);assert.equal(calls[0].name,'record_meulocal_native_opt_out_intent');assert.deepEqual(calls[0].args.p_plan,plan);assert.deepEqual(calls[0].args.p_binding,binding);
});
test('late verified evidence carries scoped attempt and uncertain compare-and-set',async()=>{
 const f=await fixture();let args;
 const result=await reconcileNativeOptOutEvidence({rpc:async(_,a)=>{args=a;return {data:{recorded:true,duplicate:false}}}},{...f,expectedStatus:'uncertain',now});
 assert.equal(result.synchronized,true);assert.equal(args.p_expected_status,'uncertain');assert.equal(args.p_attempt_id,f.plan.attemptId);assert.equal(args.p_location_id,scope.locationId);
});
test('an acknowledgement or partial evidence never reaches the reconciliation RPC',async()=>{
 for(const mutate of [f=>f.evidence={status:200},f=>f.evidence.actions[1].succeeded=false,f=>f.evidence.contactId='other',f=>f.evidence.attemptId='other',f=>f.binding.published=false]){
  const f=await fixture();mutate(f);let calls=0;await assert.rejects(reconcileNativeOptOutEvidence({rpc:async()=>{calls++;return {data:true}}},{...f,expectedStatus:'uncertain',now}));assert.equal(calls,0);
 }
});
test('RPC rejection, compare-and-set loss and duplicate receipt cannot imply fresh success',async()=>{
 const f=await fixture();
 for(const response of [{error:{message:'SYNTHETIC private diagnostic'}},{data:false},{data:{recorded:true}}])await assert.rejects(reconcileNativeOptOutEvidence({rpc:async()=>response},{...f,expectedStatus:'uncertain',now}),/native_reconciliation_failed/);
 const r=await reconcileNativeOptOutEvidence({rpc:async()=>({data:{recorded:false,duplicate:true}})},{...f,expectedStatus:'uncertain',now});assert.equal(r.synchronized,false);assert.equal(r.duplicate,true);
});
test('optional local intent recorder runs under the acquired claim before the preparation is blocked',async()=>{
 const phases=[];
 await prepareNativeOptOut({scope,source:'rcia',sourceEventRef:'SYNTHETIC:event',intent:'opt_out',now:()=>now,readLocalOptOut:async()=>({...scope,optOutAt:'2026-10-13T11:00:00Z'}),
  store:{claim:async()=>{phases.push('claim');return {acquired:true,status:'in_progress',attemptId:'SYNTHETIC-attempt',confirmed:[]}},record:async()=>phases.push('blocked')},persistIntent:async plan=>{assert.equal(plan.dispatchAllowed,false);phases.push('local-intent')}});
 assert.deepEqual(phases,['claim','local-intent','blocked']);
});
