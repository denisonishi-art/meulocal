const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {webcrypto}=require('node:crypto');
const ts=require('typescript');

const authSource=fs.readFileSync('lib/admin-auth.ts','utf8');
const authJS=ts.transpileModule(authSource,{compilerOptions:{
 module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
},reportDiagnostics:true});
assert.equal(authJS.diagnostics.filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);
const authModule={exports:{}};
new Function('module','exports','crypto',authJS.outputText)(authModule,authModule.exports,webcrypto);
const {adminSessionToken,isAdminRequest}=authModule.exports;

test('admin requests require an actual matching signed session cookie',async()=>{
 const oldKey=process.env.ADMIN_ACCESS_KEY;
 process.env.ADMIN_ACCESS_KEY='test-admin-secret-not-a-real-key';
 try{
  const token=await adminSessionToken(process.env.ADMIN_ACCESS_KEY);
  const req=(cookie)=>new Request('https://meulocal.example.invalid/api/agents/prospect/search',{headers:cookie?{cookie}:{}});
  assert.equal(await isAdminRequest(req('meulocal_admin='+token)),true);
  assert.equal(await isAdminRequest(req('')),false,'no cookie / expired browser cookie must be rejected');
  assert.equal(await isAdminRequest(req('meulocal_admin=invalid')),false);
  assert.equal(await isAdminRequest(req('meulocal_admin='+token+'tampered')),false);
 }finally{
  if(oldKey===undefined)delete process.env.ADMIN_ACCESS_KEY;
  else process.env.ADMIN_ACCESS_KEY=oldKey;
 }
});

test('8-hour session stays protected, frontend provides explicit login recovery',()=>{
 const login=fs.readFileSync('app/api/admin/session/route.ts','utf8');
 const search=fs.readFileSync('app/api/agents/prospect/search/route.ts','utf8');
 const ui=fs.readFileSync('app/admin/AdminClient.tsx','utf8');
 assert.match(login,/httpOnly:true,secure:true,sameSite:'strict',path:'\/',maxAge:60\*60\*8/);
 assert.match(search,/if\(!await isAdminRequest\(req\)\)/);
 assert.match(ui,/if\(r\.status===401\)/);
 assert.match(ui,/setSessionExpired\(true\)/);
 assert.match(ui,/\/admin-login\?next=%2Fadmin/);
 assert.match(ui,/role="alert"/);
 assert.match(ui,/meulocal-prospect-search-resume-v1/);
});

test('401 does not clear the manually selected prospects or reviewed outreach drafts',()=>{
 const ui=fs.readFileSync('app/admin/AdminClient.tsx','utf8');
 const start=ui.indexOf(' async function search(');
 const end=ui.indexOf('\n async function ',start+20);
 assert.ok(start>=0&&end>start);
 const action=ui.slice(start,end);
 const rejected=action.indexOf('if(r.status===401)');
 const reset=action.indexOf('setSelected([])');
 assert.ok(rejected>=0&&reset>rejected);
 assert.match(action,/return;/);
 assert.match(action,/window\.sessionStorage\.setItem/);
 assert.match(action,/window\.localStorage\.removeItem/);
 assert.ok(action.indexOf('window.localStorage.removeItem')>rejected);
 assert.doesNotMatch(action,/MEULOCAL_AUTO_REPLY_ENABLED|send-manual/);
});
