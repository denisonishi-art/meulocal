const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const secret='synthetic-recovery-secret-with-24-characters';
const now=Date.now(),domain='POST\n/api/internal/opendots/recover\n';
const env={OPENDOTS_COMMERCIAL_SECRET:secret,NEXT_PUBLIC_SUPABASE_URL:'https://synthetic.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service-role'};
function fixture({inbox={ok:true,ingested:1},queue={ok:true,completed:1,pending:0},throwInbox=false,throwQueue=false,config={}}={}){
 const calls=[],module={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(path.join(root,'app/api/internal/opendots/recover/route.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const requireModule=name=>{
  if(name==='node:crypto')return crypto;
  if(name==='next/server')return {NextResponse:{json:(data,options={})=>({status:options.status||200,data})}};
  if(name==='@supabase/supabase-js')return {createClient:()=>{calls.push('db');return {synthetic:true}}};
  if(name==='@/lib/ghl-controlled-reconciliation')return {reconcileControlledInbox:async()=>{calls.push('inbox');if(throwInbox)throw Error('secret_internal_error');return inbox}};
  if(name==='@/lib/agents/opendots-outbox')return {drainOpenDotsOutbox:async()=>{calls.push('queue');if(throwQueue)throw Error('secret_internal_error');return queue}};
  throw Error('unexpected_import:'+name);
 };
 vm.runInNewContext('(function(require,module,exports){'+code+'\n})',{process:{env:{...env,...config}},Buffer,Date,JSON,console:{info:()=>{}},TextDecoder})(requireModule,module,module.exports);
 async function send({payload={version:1,timestamp:now},bad=false,commercialSignature=false,origin=false,raw,contentLength}={}){
  const body=raw||JSON.stringify(payload);
  const signature='sha256='+crypto.createHmac('sha256',secret).update((commercialSignature?'':domain)+body).digest('hex');
  const req=new Request('https://meulocal.ia.br/api/internal/opendots/recover',{method:'POST',body,headers:{'Content-Type':'application/json','X-MeuLocal-Recovery-Signature':bad?'sha256=invalid':signature,...(origin?{origin:'https://meulocal.ia.br'}:{}),...(contentLength?{'content-length':contentLength}:{})}});
  return module.exports.POST(req);
 }
 return {calls,send};
}
test('signed recovery reconciles fixed scope and drains the durable queue',async()=>{const f=fixture();const r=await f.send();assert.equal(r.status,200);assert.equal(r.data.ok,true);assert.deepEqual(f.calls,['db','inbox','queue']);});
test('invalid signature, browser origin and missing config execute no work',async()=>{for(const options of [{bad:true},{origin:true},{commercialSignature:true}]){const f=fixture();assert.equal((await f.send(options)).status,401);assert.equal(f.calls.length,0)}const f=fixture({config:{OPENDOTS_COMMERCIAL_SECRET:''}});assert.equal((await f.send()).status,503);assert.equal(f.calls.length,0)});
test('stale or future timestamps cannot authorize recovery',async()=>{for(const delta of [-120000,120000]){const f=fixture();assert.equal((await f.send({payload:{version:1,timestamp:now+delta}})).status,401);assert.equal(f.calls.length,0)}});
test('caller cannot select another contact, event, URL, or any execution permission',async()=>{for(const extra of [{contactId:'other'},{eventId:'other'},{url:'https://other.invalid'},{autoReply:true},{dispatch:true}]){const f=fixture();assert.equal((await f.send({payload:{version:1,timestamp:now,...extra}})).status,400);assert.equal(f.calls.length,0)}});
test('provider read failure still attempts already persisted jobs and reports incomplete work',async()=>{const f=fixture({inbox:{ok:false,error:'inbox_provider_unavailable'}});const r=await f.send();assert.equal(r.status,503);assert.equal(r.data.ok,false);assert.deepEqual(f.calls,['db','inbox','queue']);});
test('queue failure cannot be reported as recovered',async()=>{const f=fixture({queue:{ok:false,pending:1,completed:0}});assert.equal((await f.send()).status,503)});
test('unexpected exceptions are sanitized and queue recovery is not skipped',async()=>{const f=fixture({throwInbox:true,throwQueue:true});const r=await f.send();assert.equal(r.status,503);assert.ok(!JSON.stringify(r.data).includes('secret_internal_error'));assert.deepEqual(f.calls,['db','inbox','queue']);});
test('oversized or malformed signed body executes no work',async()=>{for(const raw of ['{','x'.repeat(2048)]){const f=fixture();assert.ok([400,413].includes((await f.send({raw})).status));assert.equal(f.calls.length,0)}});
