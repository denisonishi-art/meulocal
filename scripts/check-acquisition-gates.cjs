// Actual handlers; every DB/provider operation is trapped. No production access.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
const routes=[['app/api/agents/prospect/approve/route.ts',['POST'],'MEULOCAL_PROSPECT_INITIAL_OUTREACH_ENABLED'],['app/api/agents/prospect/dispatch-pending/route.ts',['POST','GET'],'MEULOCAL_PROSPECT_INITIAL_OUTREACH_ENABLED'],['app/api/cron/acquisition-outreach/route.ts',['POST','GET'],'MEULOCAL_ACQUISITION_OUTREACH_ENABLED'],['app/api/agents/prospect/send-approved-email/route.ts',['POST'],'MEULOCAL_MANUAL_OUTREACH_ENABLED'],['app/api/agents/prospect/reply/route.ts',['POST'],'MEULOCAL_MANUAL_OUTREACH_ENABLED']];
function fixture(file,{flag,value,authorized=true}={}){
 const calls=[];const blocked=()=>{calls.push('forbidden_side_effect');throw Error('side_effect_before_permission')};
 const req=name=>{
  if(name==='next/server')return {NextResponse:{json:(data,options={})=>Response.json(data,options)}};
  if(name==='@/lib/admin-auth')return {isAdminRequest:async()=>authorized};
  if(name==='@/lib/agents/config')return {agentPolicies:{prospecting:{maxApprovedBatch:5}}};
  if(name==='@supabase/supabase-js')return {createClient:blocked};
  if(name==='@/lib/ghl-prospecting')return {enqueueGhlProspect:blocked,findBusinessEmail:blocked,sendGhlProspectWhatsApp:blocked};
  if(name==='@/lib/highlevel-operational')return {getLocationAccessToken:blocked,getOperationalConversationMessages:blocked,sendOperationalMessage:blocked,upsertOperationalContact:blocked};
  return require(name);
 };
 const module={exports:{}},code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const env={CRON_SECRET:'synthetic-cron',NEXT_PUBLIC_SUPABASE_URL:'https://synthetic.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service',GHL_API_KEY:'synthetic-provider',GHL_LOCATION_ID:'synthetic-location',...(value!==undefined?{[flag]:value}:{})};
 vm.runInNewContext('(function(require,module,exports){'+code+'\n})',{process:{env},fetch:blocked,Date,URL,AbortSignal,console})(req,module,module.exports);
 return {calls,async send(method){const response=await module.exports[method]({url:'https://synthetic.invalid/api/synthetic',headers:{get:()=>authorized?'Bearer synthetic-cron':null},json:async()=>{calls.push('body_read');return {approved:[{id:'synthetic-place',name:'Synthetic business',score:50}],diagnosticIds:['synthetic-diagnostic'],leadId:'synthetic-lead',message:'synthetic message',name:'Synthetic business',email:'synthetic@example.invalid',confirmed:true}}});return {status:response.status,data:await response.json()}}};
}
for(const [file,methods,flag] of routes){
 test(path.basename(path.dirname(file))+': authorization is required before any work',async()=>{for(const method of methods){const f=fixture(file,{flag,authorized:false}),result=await f.send(method);assert.equal(result.status,401);assert.equal(f.calls.length,0)}});
 test(path.basename(path.dirname(file))+': missing or non-exact enable flag cannot touch data or providers',async()=>{for(const value of [undefined,'false','1','TRUE',' true '])for(const method of methods){const f=fixture(file,{flag,value}),result=await f.send(method);assert.equal(result.data.status,'outreach_disabled');assert.equal(result.data.contactStarted,false);assert.equal(result.data.processed,0);assert.equal(result.status,file.includes('/cron/')?200:423);assert.equal(f.calls.length,0)}});
}
