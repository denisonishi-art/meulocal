const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const {randomUUID}=require('node:crypto');

function loadTS(path,deps={}){
 const js=ts.transpileModule(fs.readFileSync(path,'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},reportDiagnostics:true
 });
 assert.deepEqual(js.diagnostics.filter(d=>d.category===ts.DiagnosticCategory.Error),[]);
 const m={exports:{}};
 new Function('require','module','exports',js.outputText)(name=>deps[name]||require(name),m,m.exports);
 return m.exports;
}
const path='app/api/agents/prospect/verify-email/route.ts';
const interpretLCEmailVerification=loadTS('lib/acquisition/ghl-email-verification.ts').interpretLCEmailVerification;
const keys=['GHL_LOCATION_ID','NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
const savedEnv=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
const location='uNh3KsM7WFuLeTN8Q583';
for(const [key,value] of Object.entries({
 GHL_LOCATION_ID:location,
 NEXT_PUBLIC_SUPABASE_URL:'https://synthetic.supabase.invalid',
 SUPABASE_SERVICE_ROLE_KEY:'synthetic-role'
}))process.env[key]=value;
const source=fs.readFileSync(path,'utf8');
test.after(()=>{
 for(const [key,value] of Object.entries(savedEnv)){
  if(value===undefined)delete process.env[key];else process.env[key]=value;
 }
});
function setup({authorized=true,readiness=true,status=201,result='deliverable',risk='low',recommended=true,recipient='school@school.example.invalid'}={}){
 const calls={http:[],tokens:0,readiness:0,sends:0};
 const payload={id:'ChIJsyntheticPlace123',name:'Synthetic school',
  website:'https://school.example.invalid',channel:'email',recipient};
 const db={rpc:async()=>{throw Error('unexpected write')}};
 const expected={result,risk,address:recipient,leadConnectorRecommendation:{isEmailValid:recommended}};
 const mocks={
  'next/server':{NextResponse:{json:(body,opts={})=>Response.json(body,opts)}},
  '@supabase/supabase-js':{createClient:()=>db},
  '@/lib/admin-auth':{isAdminRequest:async()=>authorized},
  '@/lib/highlevel-operational':{getLocationAccessToken:async()=>{calls.tokens++;return 'synthetic-ghl-token'}},
  '@/lib/acquisition/ghl-email-verification':{interpretLCEmailVerification},
  '@/lib/acquisition/manual-prospect':{
   MANUAL_LOCATION:location,
   verifyRecipient:()=>payload,
   manualRecipientReadiness:async()=>{calls.readiness++;return readiness?{canSend:true,sendToken:'pre-verification-readiness'}:{canSend:false,reason:'blocked by DND'}},
   signRecipient:(value)=>{assert.ok(Number.isSafeInteger(value.mailboxVerifiedAt));return 'signed-after-verification'}
  }
 };
 const route=loadTS(path,mocks);
 const post=async(confirmed=true)=>{
  const orig=global.fetch;
  global.fetch=async(url,options)=>{
   calls.http.push({url,options});
   return Response.json(expected,{status});
  };
  try{return await route.POST(new Request('https://synthetic.invalid',{method:'POST',body:JSON.stringify({emailVerifyToken:'synthetic-signed-token-12345',confirmed})}))}
  finally{global.fetch=orig}
 };
 return {route,post,calls,payload};
}
test('HighLevel deliverable low risk and exact recipient are the only green outcome',()=>{
 const interpret=interpretLCEmailVerification;
 const valid={result:'deliverable',risk:'low',address:'school@example.org',leadConnectorRecommendation:{isEmailValid:true}};
 assert.equal(interpret(valid,'school@example.org').deliverable,true);
 for(const x of [
  {...valid,risk:'medium'},
  {...valid,risk:'high'},
  {...valid,address:'other@example.org'},
  {...valid,leadConnectorRecommendation:{isEmailValid:false}},
  {...valid,result:'unknown'},
  {...valid,result:'catch_all'},
  {...valid,result:'undeliverable'},
  {...valid,result:'do_not_send'}
 ])assert.equal(interpret(x,'school@example.org').deliverable,false,JSON.stringify(x));
});
test('only explicit admin confirmation invokes paid LC Email validation',async()=>{
 const f=setup(),denied=await setup({authorized:false}).post(true);
 assert.equal(denied.status,401);
 const unconfirmed=await f.post(false);
 assert.equal(unconfirmed.status,400);
 assert.equal(f.calls.http.length,0);
 assert.equal(f.calls.tokens,0);
});
test('GHL verifier uses v3 scoped email-check endpoint; returns short-lived proof without sending',async()=>{
 const f=setup();
 const response=await f.post();
 const data=await response.json();
 assert.equal(response.status,200);
 assert.equal(data.status,'deliverable');
 assert.equal(data.canSend,true);
 assert.equal(data.sendToken,'signed-after-verification');
 assert.equal(data.verified,true);
 assert.equal(f.calls.readiness,1);
 assert.equal(f.calls.http.length,1);
 const call=f.calls.http[0];
 assert.equal(call.url,'https://services.leadconnectorhq.com/email/verify?locationId='+location);
 assert.equal(call.options.method,'POST');
 assert.equal(call.options.headers.Version,'v3');
 assert.deepEqual(JSON.parse(call.options.body),{type:'email',verify:f.payload.recipient});
 assert.equal(data.charged,true);
 assert.equal(data.contactStarted,undefined);
});
test('HighLevel unknown/catch-all and DND do not mint a send credential',async()=>{
 for(const result of ['unknown','catch_all','undeliverable','do_not_send']){
  const f=setup({result});
  const data=await (await f.post()).json();
  assert.equal(data.canSend,false);
  assert.equal(data.sendToken,null);
 }
 const blocked=setup({readiness:false});
 const response=await blocked.post();
 const data=await response.json();
 assert.equal(response.status,409);
 assert.equal(blocked.calls.http.length,0,'DND block must be before any paid API call');
 assert.equal(data.charged,false);
});
test('no permissions to LC Email returns explicit scope and does not claim verification',async()=>{
 const f=setup({status:403});
 const response=await f.post();
 const data=await response.json();
 assert.equal(response.status,403);
 assert.equal(data.canSend,false);
 assert.match(data.reason,/lc-email.readonly/);
 assert.equal(data.charged,'unknown');
});
test('contact-check is free and never marks email sendable before paid verification',()=>{
 const route=fs.readFileSync('app/api/agents/prospect/contact-check/route.ts','utf8');
 assert.match(route,/requiresEmailVerification/);
 assert.match(route,/canSend:requiresEmailVerification\?false:readiness\.canSend/);
 assert.match(route,/emailVerifyToken/);
 assert.match(route,/contactAllowed:requiresEmailVerification\?false/);
 assert.doesNotMatch(route,/\/email\/verify/);
 assert.match(source,/confirmed:z\.literal\(true\)/);
 assert.match(source,/lc-email\.readonly/);
});
test('operator UI has explicit paid verification action and does not autofire checks',()=>{
 const ui=fs.readFileSync('app/admin/AdminClient.tsx','utf8');
 assert.match(ui,/async function verifyBusinessEmail/);
 assert.match(ui,/window\.confirm\('Verificar a caixa postal/);
 assert.match(ui,/US\$ 0,0025/);
 assert.match(ui,/Validar caixa de e-mail no HighLevel \(sem enviar\)/);
 assert.match(ui,/emailVerificationStatus==='deliverable'/);
});
