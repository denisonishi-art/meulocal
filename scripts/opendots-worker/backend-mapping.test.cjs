const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const adapter=require('./adapter.cjs');
const observed=new Date();
const place=(id,extra={})=>({id,name:'SYNTHETIC Geradores '+id,address:'Av. Teste, São Paulo - SP, Brasil',reviewCount:17,rating:4.8,website:'https://'+id+'.example',...extra});
test('backend projection maps observed aliases while keeping missing operational and structured location evidence unknown',()=>{
 const result=adapter.mapBackendPlaces([place('a')],observed);
 assert.equal(result.leads[0].name,place('a').name);assert.equal(result.metrics['google_places:a'].reviewCount,17);
 assert.equal(result.metrics['google_places:a'].businessStatus,'NOT_VERIFIED');assert.equal(result.metrics['google_places:a'].structuredLocation,'NOT_VERIFIED');
 assert.equal(result.leads[0].evidence[0].url,'https://meulocal.ia.br/api/places/search');
});
test('backend rejects default zero, missing metrics and wrong municipality; deduplicates identifiers and websites',()=>{
 const result=adapter.mapBackendPlaces([place('a'),place('a'),place('b',{website:'https://a.example/contact'}),place('zero',{reviewCount:0}),place('missing',{reviewCount:undefined}),place('santos',{address:'Rua São Paulo, Santos - SP, Brasil'})],observed);
 assert.equal(result.leads.length,1);assert.equal(result.excluded,5);
});
test('backend transport needs no exported Google key and never forwards the private qualification key',async()=>{
 const root=path.resolve(__dirname,'../..');const {rankLeads}=require('./test-loader.cjs')()(path.join(root,'lib/agents/prospect-intelligence.ts'));
 const calls=[];const worker=adapter.createResearchWorker({repoRoot:root,sharedRoot:path.join(process.env.OPENDOTS_ROOT||path.join(root,'.opendots/upstream'),'meulocal-adapter/shared'),endpoint:'http://127.0.0.1:3197/api/agents/prospecting',apiKey:'SYNTHETIC_PRIVATE_KEY',sourceProvider:'meulocal_backend'},{fetch:async(url,init)=>{
  calls.push({url,init});let data;if(url==='https://meulocal.ia.br/api/places/search')data={places:[place('a')]};else {const body=JSON.parse(init.body);data={mode:'research_only',job:{segment:body.segment,city:body.city,state:body.state,requestedLimit:body.requestedLimit,mode:body.mode},assessments:rankLeads(body.leads),actions:{crmWrite:false,outboundMessages:false,humanReviewRequired:true}}}return Response.json(data);
 }});
 const result=await worker.research({limit:5});assert.equal(result.provider,'meulocal_backend');assert.equal(result.commercialEligibility,'NOT_VERIFIED');assert.equal(result.assessments[0].score,30);
 assert.equal(JSON.stringify(calls[0]).includes('SYNTHETIC_PRIVATE_KEY'),false);assert.equal(calls.length,2);
});
