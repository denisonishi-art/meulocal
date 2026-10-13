import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {createRequire} from 'node:module';
import {runResearch} from './run-research.mjs';const require=createRequire(import.meta.url);const {configuration}=require('./remote-config.cjs');
const root=path.resolve(import.meta.dirname,'../..');
for(const invalid of [false,true])test('official portable worker with SYNTHETIC providers '+(invalid?'rejects HTTP 200 fake confirmation':'qualifies and deduplicates without CRM'),async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'opendots-portable-run-'));
 const config=configuration({OPENDOTS_ROOT:process.env.OPENDOTS_ROOT,OPENDOTS_DATA_DIR:path.join(dir,'data'),OPENDOTS_OUTPUT_DIR:path.join(dir,'results'),OPENDOTS_EXECUTION_MODE:'local_diagnostic',OPENAI_API_KEY:'SYNTHETIC_MODEL_KEY',CPK_INTELLIGENCE_API_KEY:'SYNTHETIC_INTELLIGENCE_KEY',MEULOCAL_PROSPECTOR_API_KEY:'SYNTHETIC_PRIVATE_KEY'},root);
 const {rankLeads}=require(path.join(config.official,'meulocal-adapter/shared/prospect-intelligence.cjs'));
 let modelCalls=0,sourceCalls=0;const destinations=[];
 try{
  const result=await runResearch(config,{fetch:async(url,init)=>{
   destinations.push(url);
   if(url===config.discoveryEndpoint){
    sourceCalls++;assert.equal(init.headers['x-prospector-api-key'],'SYNTHETIC_PRIVATE_KEY');
    const place={id:'SYNTHETIC_PLACE',name:'SYNTHETIC Geradores',address:'Rua Exemplo, São Paulo - SP, Brasil',reviewCount:12,rating:4.8};return Response.json({contract:'meulocal.places.v1',source:'google_places',observedAt:new Date().toISOString(),places:[place,place],actions:{crmWrite:false,outboundMessages:false,humanReviewRequired:true}});
   }
   if(url===config.endpoint){const payload=JSON.parse(init.body),{leads,...job}=payload;return Response.json({mode:'research_only',job,assessments:rankLeads(leads),actions:{crmWrite:invalid,outboundMessages:false,humanReviewRequired:true}})}
   assert.equal(url,'https://api.openai.com/v1/chat/completions');const payload=JSON.parse(init.body);modelCalls++;
   const tools=payload.tools.map(t=>t.function.name);const calls=modelCalls===1?['research_readiness','research_generator_prospects'].map((name,index)=>({index,id:'SYNTHETIC_CALL_'+index,type:'function',function:{name:tools.find(t=>t.endsWith(name)),arguments:JSON.stringify(name==='research_readiness'?{}:{limit:5})}})):undefined;
   const events=[{id:'SYNTHETIC_MODEL',object:'chat.completion.chunk',model:config.model,choices:[{index:0,delta:{role:'assistant',...(calls?{tool_calls:calls}:{content:'SYNTHETIC rascunho para revisão humana. NOT_VERIFIED.'})},finish_reason:null}]},{id:'SYNTHETIC_MODEL',object:'chat.completion.chunk',model:config.model,choices:[{index:0,delta:{},finish_reason:calls?'tool_calls':'stop'}]},{id:'SYNTHETIC_MODEL',object:'chat.completion.chunk',model:config.model,choices:[],usage:{prompt_tokens:100,completion_tokens:20,prompt_tokens_details:{cached_tokens:0}}}];
   return new Response(events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join('')+'data: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});
  }});
  assert.equal(result.status,invalid?'BLOCKED':'LOCAL_DIAGNOSTIC_RESEARCH_VERIFIED');assert.equal(result.crmWrites,0);assert.equal(result.outboundMessages,0);assert.equal(sourceCalls,1);assert.equal(modelCalls,2);assert.equal(result.commercialEligibility,'NOT_VERIFIED');
  assert.equal(result.agentId,JSON.parse(fs.readFileSync(new URL('./dot-identity.json',import.meta.url))).id);
  if(!invalid){assert.equal(result.research.assessments.length,1);assert.equal(result.research.assessments[0].score,30);assert.equal(result.research.excluded,1);assert.equal(result.research.drafts[0].approvalStatus,'pending_review');assert.equal(result.measuredUsage,true)}
  assert.ok(destinations.every(url=>!url.includes('leadconnector')));assert.equal(fs.existsSync(path.join(config.dataDir,'research.lock')),false);
  const saved=fs.readFileSync(path.join(config.outputDir,result.runId+'.json'),'utf8');for(const key of [config.apiKey,config.intelligenceKey,config.modelKey])assert.equal(saved.includes(key),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('existing pause is preserved and prevents all provider calls',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'opendots-paused-'));const config=configuration({OPENDOTS_ROOT:process.env.OPENDOTS_ROOT,OPENDOTS_DATA_DIR:path.join(dir,'data'),OPENDOTS_OUTPUT_DIR:path.join(dir,'results'),OPENAI_API_KEY:'SYNTHETIC_MODEL',CPK_INTELLIGENCE_API_KEY:'SYNTHETIC_INTELLIGENCE',MEULOCAL_PROSPECTOR_API_KEY:'SYNTHETIC_PRIVATE'},root);
 try{
  assert.equal((await runResearch(config,{preflight:true})).status,'PREFLIGHT_LOCAL_ONLY');
  const {pathToFileURL}=await import('node:url');const {Store}=await import(pathToFileURL(path.join(config.official,'dist/server/server/store.js')));let store=new Store(path.join(config.dataDir,'workspace.sqlite'));store.updateSettings({paused:true});store.close();
  let calls=0;const result=await runResearch(config,{preflight:true,fetch:async()=>{calls++;throw Error('unexpected')}});assert.equal(result.status,'BLOCKED');assert.equal(result.failure,'worker_paused');assert.equal(calls,0);
  store=new Store(path.join(config.dataDir,'workspace.sqlite'));assert.equal(store.settings().paused,true);store.close();
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
