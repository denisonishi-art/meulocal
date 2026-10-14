const assert=require('node:assert/strict');
const {test}=require('node:test');
const load=require('./opt-out-test-loader.cjs')();
const {MEULOCAL_GHL_WORKFLOWS,MEULOCAL_GHL_LOCATION_ID}=load('lib/ghl-workflow-removal.ts');
const {runOptOutSync}=load('lib/rcia-opt-out-sync.ts');
const scope={locationId:MEULOCAL_GHL_LOCATION_ID,contactId:'synthetic-contact',leadId:'synthetic-lead'};
const now=()=>new Date('2026-10-12T15:00:00Z');
function snapshot(count=2,extra={}){return {locationId:scope.locationId,contactId:scope.contactId,source:'ghl_verified_adapter',evidenceRef:'SYNTHETIC:membership-proof',observedAt:now().toISOString(),checkedWorkflowIds:[...MEULOCAL_GHL_WORKFLOWS],memberships:MEULOCAL_GHL_WORKFLOWS.slice(0,count).map(workflowId=>({workflowId,eventStartTime:'2026-10-10T10:00:00Z'})),...extra};}
function fixture(count=2){
 const records=[],deletes=[];let status='pending',confirmed=[];
 const store={claim:async()=>{if(['in_progress','uncertain','synchronized'].includes(status))return {acquired:false,status,confirmed};status='in_progress';return {acquired:true,status,attemptId:'SYNTHETIC-attempt',confirmed};},record:async(_,__,record)=>{status=record.status;confirmed=record.confirmed;records.push(structuredClone(record));}};
 const options={scope,store,now,membershipProvider:async()=>snapshot(count),getToken:async()=>'SYNTHETIC',fetchImpl:async(_,options)=>{if(options.method==='GET')return Response.json({contact:{id:scope.contactId,locationId:scope.locationId}});deletes.push(JSON.parse(options.body));return Response.json({succeeded:true});}};
 return {options,records,deletes,getStatus:()=>status};
}
test('zero, one and two memberships: complete evidence and persisted success',async()=>{
 for(const count of [0,1,2]){const f=fixture(count);const result=await runOptOutSync(f.options);assert.equal(result.synchronized,true);assert.equal(f.deletes.length,count);assert.equal(f.getStatus(),'synchronized');assert.equal(f.records.at(-1).confirmed.length,count);}
});
test('missing provider and incomplete, stale, wrong-location or unknown-source evidence fail closed',async()=>{
 for(const provider of [undefined,async()=>snapshot(0,{checkedWorkflowIds:[]}),async()=>snapshot(1,{locationId:'wrong'}),async()=>snapshot(2,{observedAt:'2026-10-10T10:00:00Z'}),async()=>snapshot(2,{source:'request_body'}),async()=>snapshot(2,{evidenceRef:''}),async()=>snapshot(2,{contactId:'other-contact'})]){
  const f=fixture();f.options.membershipProvider=provider;const result=await runOptOutSync(f.options);assert.equal(result.synchronized,false);assert.equal(f.deletes.length,0);assert.equal(f.getStatus(),'blocked');
 }
});
test('API/read failure before DELETE is retryable without claiming success',async()=>{
 const f=fixture();f.options.getToken=async()=>{throw Error('sensitive-token-must-not-leak')};const result=await runOptOutSync(f.options);assert.equal(result.synchronized,false);assert.equal(f.getStatus(),'failed');assert.equal(f.deletes.length,0);assert.ok(!JSON.stringify(f.records).includes('sensitive-token'));
});
test('partial failure retains receipt and ambiguous removal cannot be repeated',async()=>{
 const f=fixture();const fetch=f.options.fetchImpl;let n=0;
 f.options.fetchImpl=async(url,o)=>o.method==='DELETE'&&++n===2?Response.json({succeeded:false}):fetch(url,o);
 assert.equal((await runOptOutSync(f.options)).synchronized,false);assert.equal(f.records.at(-1).confirmed.length,1);assert.equal(f.getStatus(),'uncertain');
 await runOptOutSync(f.options);assert.equal(n,2);
});
test('duplicate and concurrent attempts cannot issue repeated DELETE',async()=>{
 const f=fixture();const results=await Promise.all([runOptOutSync(f.options),runOptOutSync(f.options)]);assert.equal(f.deletes.length,2);assert.equal(results.filter(r=>r.synchronized).length,1);assert.equal((await runOptOutSync(f.options)).synchronized,true);assert.equal(f.deletes.length,2);
});
test('attempt claim/audit failure prevents any remote call',async()=>{
 const f=fixture();f.options.store.claim=async()=>{throw Error('DB down')};let calls=0;f.options.fetchImpl=async()=>{calls++;throw Error('unexpected')};await assert.rejects(runOptOutSync(f.options));assert.equal(calls,0);
});
test('receipt persistence failure keeps uncertainty and stops the second DELETE',async()=>{
 const f=fixture();const record=f.options.store.record;
 f.options.store.record=async(...args)=>{if(args[2].status==='in_progress'&&args[2].confirmed.length===1)throw Error('DB down');return record(...args)};
 assert.equal((await runOptOutSync(f.options)).synchronized,false);assert.equal(f.deletes.length,1);assert.equal(f.getStatus(),'uncertain');
});
test('out-of-scope location cannot even claim work',async()=>{
 const f=fixture();f.options.scope={...scope,locationId:'other-location'};await assert.rejects(runOptOutSync(f.options));assert.equal(f.records.length,0);assert.equal(f.deletes.length,0);
});
test('a native synchronized ledger cannot be promoted to API success or trigger provider reads',async()=>{
 const f=fixture();f.options.store.claim=async()=>({acquired:false,status:'synchronized',confirmed:[],nativeIntent:true});
 let reads=0;f.options.getToken=async()=>{reads++;return 'SYNTHETIC'};
 assert.equal((await runOptOutSync(f.options)).synchronized,false);assert.equal(reads,0);
});
