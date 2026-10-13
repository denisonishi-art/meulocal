const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
let adapter; try{adapter=require('./adapter.cjs')}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e}
test('research adapter must exist before integration can be released',()=>assert.equal(typeof adapter?.createResearchWorker,'function'));
if(adapter){
 const place=(id,extra={})=>({id,displayName:{text:'Geradores '+id},formattedAddress:'São Paulo - SP, Brasil',addressComponents:[{longText:'São Paulo',types:['locality']},{shortText:'SP',types:['administrative_area_level_1']}],businessStatus:'OPERATIONAL',rating:4.6,userRatingCount:12,websiteUri:'https://'+id+'.example',googleMapsUri:'https://maps.google.com/?cid='+id,...extra});
 const settings={repoRoot:root,sharedRoot:path.join(process.env.OPENDOTS_ROOT||path.join(root,'.opendots/upstream'),'meulocal-adapter/shared'),endpoint:'http://127.0.0.1:3197/api/agents/prospecting',apiKey:'SYNTHETIC_PRIVATE_KEY',placesKey:'SYNTHETIC_PROVIDER_KEY'};
 const qualification=require('./test-loader.cjs')()(path.join(root,'lib/agents/prospect-intelligence.ts'));
 const calls=[];
 const reply=x=>new Response(JSON.stringify(x),{status:200,headers:{'Content-Type':'application/json'}});
 const transport=places=>async(url,init)=>{calls.push({url,init});if(url.startsWith('https://places.googleapis.com/'))return reply({places});const data=JSON.parse(init.body);return reply({mode:'research_only',job:{segment:'geradores',city:'Sao Paulo',state:'SP',requestedLimit:data.requestedLimit,mode:'research_only'},assessments:qualification.rankLeads(data.leads),actions:{crmWrite:false,outboundMessages:false,humanReviewRequired:true}})};
 test('requires explicit credentials and loopback endpoint before any network call',async()=>{
  let count=0;const fetch=async()=>{count++;throw Error('unexpected')};
  assert.throws(()=>adapter.createResearchWorker({...settings,apiKey:''},{fetch}),/private_key_missing/);
  assert.throws(()=>adapter.createResearchWorker({...settings,endpoint:'https://meulocal.ia.br/api/agents/prospecting'},{fetch}),/loopback/);
  assert.throws(()=>adapter.createResearchWorker({...settings,endpoint:'http://127.0.0.1:3197/api/agents/prospect/approve'},{fetch}),/endpoint/);
  const worker=adapter.createResearchWorker({...settings,placesKey:''},{fetch});await assert.rejects(worker.research(),/source_not_configured/);assert.equal(count,0);
 });
 test('deduplicates before limiting and uses the existing MeuLocal ranking and drafts',async()=>{
  calls.length=0;const worker=adapter.createResearchWorker(settings,{fetch:transport([place('a'),place('a'),place('b')])});const result=await worker.research({limit:2});
  assert.equal(result.assessments.length,2);assert.equal(result.assessments[0].score,30);assert.equal(result.drafts[0].draft.status,'ready_for_review');assert.equal(result.drafts[0].approvalStatus,'pending_review');
  assert.equal(calls.length,2);assert.equal(JSON.parse(calls[1].init.body).mode,'research_only');assert.equal(calls[1].init.redirect,'error');assert.equal(calls[0].init.redirect,'error');assert.equal(result.actions.outboundMessages,false);
 });
 test('street named Sao Paulo must not prove municipality or state',()=>{const mapped=adapter.mapPlaces([place('wrong-city',{formattedAddress:'Rua São Paulo, Santos - SP',addressComponents:[{longText:'Santos',types:['locality']},{shortText:'SP',types:['administrative_area_level_1']}]})],new Date());assert.equal(mapped.leads.length,0)});
 test('zero eligible results does not invent reviews or drafts',async()=>{
  const worker=adapter.createResearchWorker(settings,{fetch:transport([place('a',{userRatingCount:undefined}),place('b',{userRatingCount:120}),place('c',{formattedAddress:'Santos - SP',addressComponents:[{longText:'Santos',types:['locality']},{shortText:'SP',types:['administrative_area_level_1']}]}),place('d',{businessStatus:'CLOSED_PERMANENTLY'})])});const result=await worker.research();assert.equal(result.assessments.length,0);assert.equal(result.drafts.length,0);
 });
 test('limits batches to twenty and collapses same website',async()=>{
  const worker=adapter.createResearchWorker(settings,{fetch:transport([place('a'),place('b',{websiteUri:'https://a.example/contato'})])});const result=await worker.research();assert.equal(result.assessments.length,1);await assert.rejects(worker.research({limit:21}),/limit/);
 });
 test('rejects unsafe evidence URLs, future timestamps and provider data without metric provenance',()=>{
  assert.equal(adapter.mapPlaces([place('a',{googleMapsUri:'http://127.0.0.1/admin'})],new Date()).leads.length,0);
  assert.throws(()=>adapter.mapPlaces([place('a')],new Date(Date.now()+3600000)),/observation/);
 });
 test('HTTP 200 cannot override forbidden actions or fake success in the qualification response',async()=>{
  let i=0;const worker=adapter.createResearchWorker(settings,{fetch:async()=>++i===1?reply({places:[place('a')]}):reply({assessments:[],actions:{crmWrite:true,outboundMessages:false,humanReviewRequired:true}})});await assert.rejects(worker.research(),/confirmation/);
 });
 test('provider errors are sanitized and never contain credential values',async()=>{
  const worker=adapter.createResearchWorker(settings,{fetch:async()=>new Response('SYNTHETIC_PROVIDER_KEY',{status:403})});await assert.rejects(worker.research(),e=>e.message==='source_http_403'&&!e.message.includes(settings.placesKey));
 });
 test('prevents concurrent runs in the same worker and releases after failure',async()=>{
  let release;const wait=new Promise(r=>{release=r});let i=0;const worker=adapter.createResearchWorker(settings,{fetch:async()=>{if(++i===1){await wait;return reply({places:[]})}return reply({mode:'research_only',job:{segment:'geradores',city:'Sao Paulo',state:'SP',requestedLimit:20,mode:'research_only'},assessments:[],actions:{crmWrite:false,outboundMessages:false,humanReviewRequired:true}})}});const first=worker.research();await assert.rejects(worker.research(),/run_in_progress/);release();await first;
 });
}
