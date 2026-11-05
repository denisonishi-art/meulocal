const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const path=require('node:path');
function loadTs(file,deps={},globals={}){
 const js=ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},
  reportDiagnostics:true
 });
 const errors=js.diagnostics.filter(d=>d.category===ts.DiagnosticCategory.Error);
 assert.equal(errors.length,0);
 const m={exports:{}};
 new Function('require','module','exports',js.outputText)((name)=>deps[name]||require(name),m,m.exports);
 return m.exports;
}
const attribution=loadTs('lib/acquisition/recipient-attribution.ts');
test('email linked to verified business website may pass, not any domain with an MX',()=>{
 assert.equal(attribution.evaluateBusinessEmailAttribution('escola@fisk.com.br','https://www.fisk.com.br/unidades').allowed,true);
 assert.equal(attribution.evaluateBusinessEmailAttribution('support@school.example.com','https://school.example.com').allowed,true);
 for(const [email,site] of [
  ['sac@moveedu.com.br','https://www.yazigi.com.br'],
  ['joao@email.com','https://casabritanica.com.br'],
  ['joao@email.com','https://email.com'],
  ['vendas@example.com','https://example.com'],
  ['qualquer@gmail.com','https://school.example.com']
 ]){
  const x=attribution.evaluateBusinessEmailAttribution(email,site);
  assert.equal(x.allowed,false,email);
  assert.match(x.reason,/(domínio|Endereço|confirme|Confirmar)/i);
 }
});
test('contact-check uses domain gate before signing recipient for manually approved prospect',()=>{
 const s=fs.readFileSync('app/api/agents/prospect/contact-check/route.ts','utf8');
 assert.match(s,/evaluateBusinessEmailAttribution\(email,p\.websiteUri\)/);
 assert.match(s,/attribution\?\.allowed\?'email':'blocked'/);
 assert.match(s,/sendToken:null/);
 const route=fs.readFileSync('app/api/agents/prospect/send-manual/route.ts','utf8');
 assert.match(route,/console\.error\(JSON\.stringify/);
 assert.match(route,/stage='ghl_contact_creation'/);
 assert.match(route,/stage='ghl_contact_confirmation'/);
 assert.match(route,/stage='supabase_contact_binding'/);
 assert.match(route,/retryAllowed:false/);
});
const ATTEMPT={
 request_id:'11111111-2222-4333-8444-555555555555',
 place_id:'ChIJsyntheticCompany12345',name:'Casa Britânica',address:'São Paulo',
 recipient:'joao@email.com',channel:'email',lead_id:'22222222-2222-4333-8444-555555555555',
 contact_id:null,stage:'provisioning',created_at:new Date().toISOString(),expires_at:new Date(Date.now()+1500000).toISOString()
};
function mockRoute({authorized=true,provider='found',stage='provisioning',events=[]}={}){
 const calls=[];
 const attempts=[{...ATTEMPT,stage}];
 const db={from(table){
  const query={
   select(){return query},
   eq(){return query},
   in(){return query},
   order(){return query},
   limit(){calls.push(table);return Promise.resolve({data:table==='manual_prospect_permissions'?attempts:events,error:null})}
  };
  return query;
 }};
 const mocks={
  'next/server':{NextResponse:{json:(body,options={})=>Response.json(body,options)}},
  '@supabase/supabase-js':{createClient:()=>db},
  '@/lib/admin-auth':{isAdminRequest:async()=>authorized},
  '@/lib/highlevel-operational':{getLocationAccessToken:async()=>provider==='unverified'?Promise.reject(new Error('unavailable')):'synthetic-token'},
  '@/lib/acquisition/manual-prospect':{MANUAL_LOCATION:'synthetic-location',findExactRecipient:async()=>provider==='found'?{id:'synthetic-contact'}:null}
 };
 const route=loadTs('app/api/agents/prospect/inspect-manual/route.ts',mocks);
 const post=()=>route.POST(new Request('https://test.invalid/api/agents/prospect/inspect-manual',{method:'POST',body:JSON.stringify({placeId:ATTEMPT.place_id})}));
 return {post,calls};
}
test('read-only audit shows provisioning and no send, provider contact found',async()=>{
 const f=mockRoute(),response=await f.post(),data=await response.json();
 assert.equal(response.status,200);
 assert.equal(data.status,'provisioning_unconfirmed');
 assert.equal(data.sent,0);
 assert.equal(data.contactStarted,false);
 assert.equal(data.attempts[0].hasSendReceipt,false);
 assert.equal(data.attempts[0].providerContact,'found');
 assert.equal(data.attempts[0].retryAllowed,false);
 assert.deepEqual(f.calls,['manual_prospect_permissions','outreach_events']);
 assert.match(response.headers.get('cache-control'),/no-store/);
});
test('unavailable HighLevel cannot be claimed as absence of contact or permission to retry',async()=>{
 const response=await mockRoute({provider:'unverified'}).post(),data=await response.json();
 assert.equal(response.status,200);
 assert.equal(data.attempts[0].providerContact,'unverified');
 assert.equal(data.attempts[0].retryAllowed,false);
});
test('recorded send receipt distinguishes accepted by provider from delivered',async()=>{
 const event={lead_id:ATTEMPT.lead_id,event_type:'sent',external_id:'provider-message-id',dispatch_state:'sent',created_at:new Date().toISOString()};
 const data=await (await mockRoute({stage:'ready',events:[event]}).post()).json();
 assert.equal(data.status,'send_recorded');
 assert.equal(data.attempts[0].hasSendReceipt,true);
 assert.match(data.attempts[0].interpretation,/entrega ainda exige confirmação/i);
 assert.equal(data.sent,0);
});
test('admin audit denies unauthenticated caller without any Supabase or HighLevel reads',async()=>{
 const f=mockRoute({authorized:false});
 const response=await f.post();
 assert.equal(response.status,401);
 assert.equal(f.calls.length,0);
});
test('admin UI provides read-only audit of an uncertain send and never auto-retries',()=>{
 const ui=fs.readFileSync('app/admin/AdminClient.tsx','utf8');
 assert.match(ui,/Conferir tentativa \(sem enviar\)/);
 assert.match(ui,/\/api\/agents\/prospect\/inspect-manual/);
 assert.match(ui,/manualAudit\[p\.id\]/);
 const send=ui.slice(ui.indexOf('async function sendManualProspect('),ui.indexOf('async function checkChannels('));
 assert.match(send,/window\.confirm/);
 assert.doesNotMatch(send,/clearManualAttempt/);
});
