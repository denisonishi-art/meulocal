const fs=require('node:fs');
const assert=require('node:assert/strict');
const ts=require('typescript');
const source=fs.readFileSync('lib/ghl-workflow-removal.ts','utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const m={exports:{}};
new Function('module','exports',js)(m,m.exports);
const {MEULOCAL_GHL_WORKFLOWS,validateWorkflowRemovals,removeVerifiedWorkflowEnrollments}=m.exports;
const entries=MEULOCAL_GHL_WORKFLOWS.map(workflowId=>({workflowId,eventStartTime:'2026-10-10T10:00:00-03:00'}));
assert.equal(validateWorkflowRemovals(entries).length,2);
for(const invalid of [[],entries.slice(0,1),[entries[0],entries[0]],[{...entries[0],eventStartTime:'2026-10-10'},entries[1]],[{...entries[0],workflowId:'other'},entries[1]]]){
  assert.throws(()=>validateWorkflowRemovals(invalid));
}
(async()=>{
  const requests=[];
  await removeVerifiedWorkflowEnrollments({token:'mock',contactId:'contact-verified',removals:entries,fetchImpl:async(url,options)=>{
    requests.push({url,options});return {ok:true,json:async()=>({succeeded:true})};
  }});
  assert.equal(requests.length,2);
  for(const request of requests){assert.equal(request.options.method,'DELETE');assert.equal(request.options.headers.Version,'v3');assert.deepEqual(JSON.parse(request.options.body),{eventStartTime:'2026-10-10T10:00:00-03:00'});}
  let n=0;
  await assert.rejects(removeVerifiedWorkflowEnrollments({token:'mock',contactId:'test',removals:entries,fetchImpl:async()=>{n++;return {ok:false,status:403};}}));
  assert.equal(n,1,'stop on first failure');
  console.log('GHL workflow removal contract tests passed (no external calls)');
})().catch(err=>{console.error(err);process.exitCode=1});
