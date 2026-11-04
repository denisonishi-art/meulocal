import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createHmac} from 'node:crypto';
import {createDispatcher,createDeepSeekModelTurn} from './commercial-server-hermes.mjs';
import {canDispatch,contactBlocked,contactAllowedForDispatch,contactIsolatedForHermes,sendGhlResponse,reconcileSentMessage} from './ghl-dispatch.mjs';
import {createDispatchLedger} from './dispatch-ledger.mjs';
import {createReceiver} from './commercial-server.mjs';
import {createReceiptStore} from './commercial-receipts.mjs';

const originalFetch=globalThis.fetch;
const LEDGER_SECRET='synthetic-ledger-secret-24-chars';
function setEnv(vars){for(const[k,v]of Object.entries(vars)){if(v===undefined)delete process.env[k];else process.env[k]=v}}
function restoreFetch(){globalThis.fetch=originalFetch}

const decision={action:'answer',channel:'whatsapp',message:'Olá',status:'suggestion_only',requiresHumanReview:true,eventId:'e'};
const ev={eventId:'e',contactId:'c',permissions:{autoReply:true}};
const validContact={id:'c',locationId:'loc',dnd:false,phone:'+5511999999999',tags:['meulocal:hermes-auto']};

function makeDispatcher(overrides={}){
  return createDispatcher({
    canDispatch:overrides.canDispatch??(()=>true),
    contactAllowedForDispatch:overrides.contactAllowedForDispatch??(()=>true),
    contactIsolatedForHermes:overrides.contactIsolatedForHermes??(()=>true),
    readContactForSend:overrides.readContactForSend??(async()=>validContact),
    contactBlocked:overrides.contactBlocked??contactBlocked,
    sendGhlResponse:overrides.sendGhlResponse??(async()=>({messageId:'m-1',conversationId:'conv-1'})),
    reconcileSentMessage:overrides.reconcileSentMessage??(async()=>({found:false})),
    ledger:overrides.ledger??null,
    token:overrides.token??'t',
    locationId:overrides.locationId??'loc',
  });
}

// ---- Fix 2: DND / opt-out / channel eligibility (fail-closed) ----
test('contactBlocked fails closed on missing/inconsistent DND and channel fields',()=>{
  assert.equal(contactBlocked({dnd:true}).blocked,true);
  assert.equal(contactBlocked({}).blocked,true);
  assert.equal(contactBlocked({dnd:'yes'}).blocked,true);
  assert.equal(contactBlocked({dnd:false,tags:['meulocal:opt-out']}).blocked,true);
  assert.equal(contactBlocked({dnd:false},'whatsapp').blocked,true);
  assert.equal(contactBlocked({dnd:false,phone:'+5511'},'whatsapp').blocked,false);
  assert.equal(contactBlocked({dnd:false},'email').blocked,true);
  assert.equal(contactBlocked({dnd:false,email:'x@y.com'},'email').blocked,false);
});

test('dispatch blocks a DND/opt-out contact before sending',async()=>{
  const sends=[];const d=makeDispatcher({contactBlocked:()=>({blocked:true,reason:'dnd'}),sendGhlResponse:async x=>{sends.push(x);return {messageId:'m'}}});
  const r=await d(decision,ev);
  assert.equal(r.dispatch.status,'blocked');assert.equal(r.dispatch.reason,'dnd');assert.equal(sends.length,0);
});

// ---- Fix 1: recoverable + idempotent dispatch ----
test('dispatch sends once and records a sent ledger',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ml-ledger-'));const ledger=createDispatchLedger(dir,LEDGER_SECRET);
  let sends=0;const d=makeDispatcher({ledger,sendGhlResponse:async()=>{sends++;return {messageId:'m-1',conversationId:'conv-1'}}});
  const r=await d(decision,ev);
  assert.equal(r.dispatch.status,'sent');assert.equal(r.dispatch.messageId,'m-1');assert.equal(sends,1);
  assert.equal(ledger.read('e').state,'sent');fs.rmSync(dir,{recursive:true,force:true});
});
test('dispatch with a sent ledger never re-sends',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ml-ledger-'));const ledger=createDispatchLedger(dir,LEDGER_SECRET);
  ledger.markSent('e',{messageId:'m-old',conversationId:'conv-old'});
  let sends=0;const d=makeDispatcher({ledger,sendGhlResponse:async()=>{sends++;return {messageId:'m-new'}}});
  const r=await d(decision,ev);
  assert.equal(r.dispatch.status,'sent');assert.equal(r.dispatch.messageId,'m-old');assert.equal(sends,0);
  fs.rmSync(dir,{recursive:true,force:true});
});
test('dispatch reconciles an intent that actually landed and does not re-send',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ml-ledger-'));const ledger=createDispatchLedger(dir,LEDGER_SECRET);
  ledger.recordIntent('e',{channel:'whatsapp',contactId:'c',message:'Olá'});
  let sends=0;const d=makeDispatcher({ledger,reconcileSentMessage:async()=>({found:true,messageId:'m-landed',conversationId:'conv'}),sendGhlResponse:async()=>{sends++;return {messageId:'m-dup'}}});
  const r=await d(decision,ev);
  assert.equal(r.dispatch.status,'sent');assert.equal(r.dispatch.messageId,'m-landed');assert.equal(sends,0);
  assert.equal(ledger.read('e').state,'sent');fs.rmSync(dir,{recursive:true,force:true});
});
test('dispatch re-sends when reconciliation finds nothing (send never landed)',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ml-ledger-'));const ledger=createDispatchLedger(dir,LEDGER_SECRET);
  ledger.recordIntent('e',{channel:'whatsapp',contactId:'c',message:'Olá'});
  let sends=0;const d=makeDispatcher({ledger,reconcileSentMessage:async()=>({found:false}),sendGhlResponse:async()=>{sends++;return {messageId:'m-2'}}});
  const r=await d(decision,ev);
  assert.equal(r.dispatch.status,'sent');assert.equal(r.dispatch.messageId,'m-2');assert.equal(sends,1);
  fs.rmSync(dir,{recursive:true,force:true});
});
test('dispatch defers (no re-send) when reconciliation is unavailable',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ml-ledger-'));const ledger=createDispatchLedger(dir,LEDGER_SECRET);
  ledger.recordIntent('e',{channel:'whatsapp',contactId:'c',message:'Olá'});
  let sends=0;const d=makeDispatcher({ledger,reconcileSentMessage:async()=>{throw Error('ghl_conv_search_500')},sendGhlResponse:async()=>{sends++;return {messageId:'m'}}});
  const r=await d(decision,ev);
  assert.equal(r.dispatch.status,'pending_reconciliation');assert.equal(sends,0);
  assert.equal(ledger.read('e').state,'intent');fs.rmSync(dir,{recursive:true,force:true});
});
test('dispatch marks ledger failed when the send fails',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ml-ledger-'));const ledger=createDispatchLedger(dir,LEDGER_SECRET);
  const d=makeDispatcher({ledger,sendGhlResponse:async()=>{throw Error('ghl_send_500')}});
  const r=await d(decision,ev);
  assert.equal(r.dispatch.status,'error');assert.equal(ledger.read('e').state,'failed');
  fs.rmSync(dir,{recursive:true,force:true});
});

// ---- Fix 3: isolation ----
test('dispatch skips a contact without the Hermes isolation tag',async()=>{
  let sends=0;const d=makeDispatcher({contactIsolatedForHermes:()=>false,sendGhlResponse:async()=>{sends++;return {messageId:'m'}}});
  const r=await d(decision,ev);
  assert.equal(r.dispatch.status,'skipped');assert.equal(r.dispatch.reason,'contact_not_isolated_for_hermes');assert.equal(sends,0);
});
test('contactIsolatedForHermes requires the isolation tag',()=>{
  setEnv({MEULOCAL_HERMES_HANDLED_TAG:undefined});
  assert.equal(contactIsolatedForHermes({tags:['meulocal:hermes-auto']}),true);
  assert.equal(contactIsolatedForHermes({tags:['other']}),false);
  assert.equal(contactIsolatedForHermes({}),false);
});

// ---- permissions / allowlist (kept) ----
test('canDispatch gating',()=>{
  setEnv({MEULOCAL_AUTO_REPLY_ENABLED:undefined,GHL_API_KEY:undefined});assert.equal(canDispatch(),false);
  setEnv({MEULOCAL_AUTO_REPLY_ENABLED:'true',GHL_API_KEY:'k'});assert.equal(canDispatch(),true);
  setEnv({MEULOCAL_AUTO_REPLY_ENABLED:undefined,GHL_API_KEY:undefined});
});
test('dispatch does not send when autoReply is not authorized',async()=>{
  let sends=0;const d=makeDispatcher({sendGhlResponse:async()=>{sends++;return {messageId:'m'}}});
  const r=await d(decision,{contactId:'c',permissions:{autoReply:false}});
  assert.equal(r.dispatch,undefined);assert.equal(sends,0);
});
test('dispatch skips a contact outside the E2E allowlist',async()=>{
  let sends=0;const d=makeDispatcher({contactAllowedForDispatch:()=>false,sendGhlResponse:async()=>{sends++;return {messageId:'m'}}});
  const r=await d(decision,ev);
  assert.equal(r.dispatch.status,'skipped');assert.equal(r.dispatch.reason,'contact_not_in_e2e_allowlist');assert.equal(sends,0);
});

// ---- Fix 4: health reflects real dispatch state without secrets ----
test('receiver /health reflects real dispatch state and reveals no secrets/PII',async()=>{
  const secret='synthetic-integration-secret-with-24-chars';const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ml-hlth-'));const receipts=createReceiptStore(dir,secret);
  const health={status:'ready',runtime:'hermes',dispatch:false,allowlist:'set',model:'deepseek-direct'};
  const server=createReceiver({secret,receipts,modelTurn:async()=>'{}',health});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{
    const res=await fetch('http://127.0.0.1:'+server.address().port+'/health');
    const body=await res.json();
    assert.equal(body.runtime,'hermes');assert.equal(body.dispatch,false);assert.equal(body.allowlist,'set');
    assert.equal(JSON.stringify(body).includes('secret'),false);
    assert.equal(JSON.stringify(body).includes('token'),false);
  }finally{await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true})}
});

// ---- DeepSeek modelTurn (kept) ----
test('createDeepSeekModelTurn calls chat/completions with no tools and returns content',async()=>{
  const calls=[];const content='{"action":"handoff","channel":"none","message":"","rationale":"x","requiresHumanReview":true}';
  const mt=createDeepSeekModelTurn({apiKey:'sk-test',baseUrl:'https://api.deepseek.invalid/v1',fetchImpl:async(url,init)=>{calls.push({url:String(url),body:JSON.parse(init.body)});return {ok:true,json:async()=>({choices:[{message:{content}}]})}}});
  assert.equal(await mt('p'),content);
  assert.equal(calls[0].body.model,'deepseek-v4-pro');assert.equal(calls[0].body.tools,undefined);
});
test('createDeepSeekModelTurn fails on non-2xx and empty response',async()=>{
  await assert.rejects(createDeepSeekModelTurn({apiKey:'sk-test',fetchImpl:async()=>({ok:false,status:401,json:async()=>({})})})('p'),/deepseek_http_401/);
  await assert.rejects(createDeepSeekModelTurn({apiKey:'sk-test',fetchImpl:async()=>({ok:true,json:async()=>({choices:[]})})})('p'),/deepseek_empty_response/);
});

// ---- receiver dedup + concurrency (kept) ----
test('receiver runs onDecision exactly once per event (dedup by saved receipt)',async()=>{
  const secret='synthetic-integration-secret-with-24-chars';const dir=fs.mkdtempSync(path.join(os.tmpdir(),'meulocal-dispatch-'));const receipts=createReceiptStore(dir,secret);
  const event={kind:'meulocal.acquisition.inbound',eventId:'synthetic-dispatch-1',leadId:'l',contactId:'c',message:'Como funciona?',channel:'whatsapp',permissions:{initialSend:false,autoReply:false,crmWrite:false}};
  let decisions=0;const decisionJson=JSON.stringify({action:'answer',channel:'whatsapp',message:'Olá',rationale:'x',requiresHumanReview:true});
  const server=createReceiver({secret,receipts,modelTurn:async()=>decisionJson,onDecision:async d=>{decisions++;return {...d,dispatch:{status:'sent',messageId:'m'}}}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{
    const send=()=>fetch('http://127.0.0.1:'+server.address().port+'/commercial/inbound',{method:'POST',body:JSON.stringify(event),headers:{'X-MeuLocal-Signature':'sha256='+createHmac('sha256',secret).update(JSON.stringify(event)).digest('hex')}});
    assert.equal((await(await send()).json()).dispatch.status,'sent');
    assert.equal((await(await send()).json()).status,'decision_saved');
    assert.equal(decisions,1);
  }finally{await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true})}
});

// ---- reconciliation primitive (mocked) ----
test('reconcileSentMessage finds a matching outbound message and returns its id',async()=>{
  const fetchImpl=async(url)=>{String(url);
    if(String(url).includes('/conversations/search'))return {ok:true,json:async()=>({conversations:[{id:'conv-1'}]})};
    return {ok:true,json:async()=>({messages:{messages:[{id:'msg-1',direction:'outbound',body:'Olá',dateAdded:new Date().toISOString()}]}})};
  };
  const r=await reconcileSentMessage({token:'t',locationId:'loc',contactId:'c',message:'Olá',since:new Date(Date.now()-60000).toISOString(),fetchImpl});
  assert.equal(r.found,true);assert.equal(r.messageId,'msg-1');
});
test('reconcileSentMessage returns not-found when no outbound match',async()=>{
  const fetchImpl=async(url)=>String(url).includes('/conversations/search')?{ok:true,json:async()=>({conversations:[{id:'conv-1'}]})}:{ok:true,json:async()=>({messages:{messages:[{id:'m',direction:'inbound',body:'Olá',dateAdded:new Date().toISOString()}]}})};
  const r=await reconcileSentMessage({token:'t',locationId:'loc',contactId:'c',message:'Olá',since:null,fetchImpl});
  assert.equal(r.found,false);
});
