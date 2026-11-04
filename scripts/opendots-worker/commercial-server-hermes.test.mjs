import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createHmac} from 'node:crypto';
import {dispatchDecision,createDeepSeekModelTurn} from './commercial-server-hermes.mjs';
import {canDispatch,contactBlocked,sendGhlResponse,contactAllowedForDispatch} from './ghl-dispatch.mjs';
import {createReceiver} from './commercial-server.mjs';
import {createReceiptStore} from './commercial-receipts.mjs';

const originalFetch=globalThis.fetch;
function setEnv(vars){for(const[k,v]of Object.entries(vars)){if(v===undefined)delete process.env[k];else process.env[k]=v}}
function restoreFetch(){globalThis.fetch=originalFetch}

test('canDispatch is false unless enabled and a GHL key is present',()=>{
 setEnv({MEULOCAL_AUTO_REPLY_ENABLED:undefined,GHL_API_KEY:undefined});assert.equal(canDispatch(),false);
 setEnv({MEULOCAL_AUTO_REPLY_ENABLED:'true',GHL_API_KEY:undefined});assert.equal(canDispatch(),false);
 setEnv({MEULOCAL_AUTO_REPLY_ENABLED:'true',GHL_API_KEY:'synthetic'});assert.equal(canDispatch(),true);
 setEnv({MEULOCAL_AUTO_REPLY_ENABLED:undefined,GHL_API_KEY:undefined});
});
test('contactBlocked detects DND and the opt-out tag',()=>{
 assert.equal(contactBlocked({dnd:true}).blocked,true);
 assert.equal(contactBlocked({tags:['meulocal:opt-out']}).blocked,true);
 assert.equal(contactBlocked({dnd:false}).blocked,false);
});
test('contactAllowedForDispatch: unset allowlist allows everyone; a set allowlist restricts to listed IDs',()=>{
 setEnv({MEULOCAL_E2E_ALLOWED_CONTACTS:undefined});
 assert.equal(contactAllowedForDispatch('anything'),true);
 setEnv({MEULOCAL_E2E_ALLOWED_CONTACTS:' c-approved-1 , c-approved-2 '});
 assert.equal(contactAllowedForDispatch('c-approved-1'),true);
 assert.equal(contactAllowedForDispatch('c-approved-2'),true);
 assert.equal(contactAllowedForDispatch('c-random'),false);
 setEnv({MEULOCAL_E2E_ALLOWED_CONTACTS:undefined});
});
test('sendGhlResponse posts the correct WhatsApp payload',async()=>{
 const calls=[];const fetchImpl=async(url,init)=>{calls.push({url:String(url),body:JSON.parse(init.body),headers:init.headers});return {ok:true,json:async()=>({messageId:'msg-1'})}};
 const r=await sendGhlResponse({token:'t',contactId:'c',channel:'whatsapp',message:'Olá',fetchImpl});
 assert.equal(r.messageId,'msg-1');assert.equal(calls[0].body.type,'WhatsApp');assert.equal(calls[0].body.contactId,'c');assert.equal(calls[0].headers.Version,'2021-07-28');
});
test('dispatchDecision is inert when disabled',async()=>{
 setEnv({MEULOCAL_AUTO_REPLY_ENABLED:undefined,GHL_API_KEY:undefined});
 const r=await dispatchDecision({action:'answer',channel:'whatsapp',message:'Olá',status:'suggestion_only',requiresHumanReview:true,eventId:'e'},{contactId:'c'});assert.equal(r.dispatch,undefined);
});
test('dispatchDecision sends an answer when enabled and preserves the decision contract',async()=>{
 setEnv({MEULOCAL_AUTO_REPLY_ENABLED:'true',GHL_API_KEY:'synthetic',GHL_LOCATION_ID:'loc'});
 const calls=[];globalThis.fetch=async(url,init)=>{calls.push({url:String(url),body:init?.body?JSON.parse(init.body):undefined});if(String(url).includes('/contacts/'))return {ok:true,json:async()=>({contact:{id:'c',locationId:'loc',dnd:false}})};return {ok:true,json:async()=>({messageId:'sent-1'})}};
 try{
  const r=await dispatchDecision({action:'answer',channel:'whatsapp',message:'Olá',status:'suggestion_only',requiresHumanReview:true,eventId:'e'},{contactId:'c'});
  assert.equal(r.dispatch.status,'sent');assert.equal(r.dispatch.messageId,'sent-1');assert.equal(r.status,'suggestion_only');assert.equal(r.requiresHumanReview,true);assert.equal(calls.length,2);
 }finally{restoreFetch();setEnv({MEULOCAL_AUTO_REPLY_ENABLED:undefined,GHL_API_KEY:undefined})}
});
test('dispatchDecision blocks a DND or opt-out contact before sending',async()=>{
 setEnv({MEULOCAL_AUTO_REPLY_ENABLED:'true',GHL_API_KEY:'synthetic',GHL_LOCATION_ID:'loc'});
 let sends=0;globalThis.fetch=async url=>{if(String(url).includes('/contacts/'))return {ok:true,json:async()=>({contact:{id:'c',locationId:'loc',dnd:true}})};sends++;return {ok:true,json:async()=>({})}};
 try{
  const r=await dispatchDecision({action:'answer',channel:'whatsapp',message:'Olá',status:'suggestion_only',requiresHumanReview:true,eventId:'e'},{contactId:'c'});
  assert.equal(r.dispatch.status,'blocked');assert.equal(sends,0);
 }finally{restoreFetch();setEnv({MEULOCAL_AUTO_REPLY_ENABLED:undefined,GHL_API_KEY:undefined})}
});
test('dispatchDecision skips a contact outside the E2E allowlist even when enabled',async()=>{
 setEnv({MEULOCAL_AUTO_REPLY_ENABLED:'true',GHL_API_KEY:'synthetic',GHL_LOCATION_ID:'loc',MEULOCAL_E2E_ALLOWED_CONTACTS:'c-approved-only'});
 let sends=0;globalThis.fetch=async()=>{sends++;return {ok:true,json:async()=>({})}};
 try{
  const r=await dispatchDecision({action:'answer',channel:'whatsapp',message:'Olá',status:'suggestion_only',requiresHumanReview:true,eventId:'e'},{contactId:'c-not-approved'});
  assert.equal(r.dispatch.status,'skipped');assert.equal(r.dispatch.reason,'contact_not_in_e2e_allowlist');assert.equal(sends,0);
 }finally{restoreFetch();setEnv({MEULOCAL_AUTO_REPLY_ENABLED:undefined,GHL_API_KEY:undefined,MEULOCAL_E2E_ALLOWED_CONTACTS:undefined})}
});
test('dispatchDecision never sends for handoff/stop/none and surfaces provider errors',async()=>{
 setEnv({MEULOCAL_AUTO_REPLY_ENABLED:'true',GHL_API_KEY:'synthetic',GHL_LOCATION_ID:'loc'});
 let calls=0;globalThis.fetch=async()=>{calls++;throw Error('synthetic_provider_down')};
 try{
  for(const action of ['handoff','stop']){const r=await dispatchDecision({action,channel:'none',message:'',status:'suggestion_only',requiresHumanReview:true,eventId:'e'},{contactId:'c'});assert.equal(r.dispatch,undefined)}
  const err=await dispatchDecision({action:'answer',channel:'whatsapp',message:'Olá',status:'suggestion_only',requiresHumanReview:true,eventId:'e'},{contactId:'c'});
  assert.equal(err.dispatch.status,'error');assert.ok(calls>0);
 }finally{restoreFetch();setEnv({MEULOCAL_AUTO_REPLY_ENABLED:undefined,GHL_API_KEY:undefined})}
});
test('createDeepSeekModelTurn calls chat/completions with no tools and returns content',async()=>{
 const calls=[];const content='{"action":"handoff","channel":"none","message":"","rationale":"x","requiresHumanReview":true}';
 const mt=createDeepSeekModelTurn({apiKey:'sk-test',baseUrl:'https://api.deepseek.invalid/v1',fetchImpl:async(url,init)=>{calls.push({url:String(url),body:JSON.parse(init.body)});return {ok:true,json:async()=>({choices:[{message:{content}}]})}}});
 assert.equal(await mt('p'),content);
 assert.equal(calls[0].body.model,'deepseek-v4-pro');
 assert.equal(calls[0].body.tools,undefined); // zero tool execution surface
 assert.equal(calls[0].body.temperature,0.2);
});
test('createDeepSeekModelTurn fails on non-2xx and empty response',async()=>{
 await assert.rejects(createDeepSeekModelTurn({apiKey:'sk-test',fetchImpl:async()=>({ok:false,status:401,json:async()=>({})})})('p'),/deepseek_http_401/);
 await assert.rejects(createDeepSeekModelTurn({apiKey:'sk-test',fetchImpl:async()=>({ok:true,json:async()=>({choices:[]})})})('p'),/deepseek_empty_response/);
});
test('receiver runs onDecision exactly once per event (dedup by saved receipt)',async()=>{
 const secret='synthetic-integration-secret-with-24-chars';const dir=fs.mkdtempSync(path.join(os.tmpdir(),'meulocal-dispatch-'));const receipts=createReceiptStore(dir,secret);
 const event={kind:'meulocal.acquisition.inbound',eventId:'synthetic-dispatch-1',leadId:'l',contactId:'c',message:'Como funciona?',channel:'whatsapp',permissions:{initialSend:false,autoReply:false,crmWrite:false}};
 let decisions=0;const decision=JSON.stringify({action:'answer',channel:'whatsapp',message:'Olá',rationale:'x',requiresHumanReview:true});
 const server=createReceiver({secret,receipts,modelTurn:async()=>decision,onDecision:async d=>{decisions++;return {...d,dispatch:{status:'sent',messageId:'m'}}}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const send=()=>fetch('http://127.0.0.1:'+server.address().port+'/commercial/inbound',{method:'POST',body:JSON.stringify(event),headers:{'X-MeuLocal-Signature':'sha256='+createHmac('sha256',secret).update(JSON.stringify(event)).digest('hex')}});
  assert.equal((await(await send()).json()).dispatch.status,'sent');
  assert.equal((await(await send()).json()).status,'decision_saved');
  assert.equal(decisions,1);
 }finally{await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true})}
});
