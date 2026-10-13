const {test}=require('node:test');const assert=require('node:assert/strict');const loader=require('./test-loader.cjs');
const secret='SYNTHETIC_DEDICATED';process.env.MEULOCAL_PROSPECTOR_API_KEY=secret;
function route(rate={allowed:true,mode:'enforced'}){return loader({'@/lib/rate-limit':{consumeRateLimit:async()=>rate}})('app/api/agents/prospecting/route.ts')}
const req=body=>new Request('https://synthetic.invalid/api/agents/prospecting',{method:'POST',headers:{'x-prospector-api-key':secret},body:JSON.stringify(body)});
const job={segment:'pizzarias',city:'Sao Paulo',state:'SP',requestedLimit:5,mode:'research_only',leads:[]};
test('qualification rejects unbounded and unknown fields; fails closed without shared rate enforcement',async()=>{
 assert.equal((await route().POST(req({...job,dispatch:true}))).status,400);
 assert.equal((await route({allowed:true,mode:'fail_open'}).POST(req(job))).status,503);
 assert.equal((await route({allowed:false,mode:'enforced'}).POST(req(job))).status,429);
});
test('qualification validates source timestamps and protects body volume',async()=>{
 const lead={externalId:'google_places:SYNTHETIC',name:'SYNTHETIC',segment:'pizzarias',city:'Sao Paulo',state:'SP',evidence:[{signal:'few_reviews',url:'https://maps.google.com/?q=SYNTHETIC',observedAt:'2099-01-01T00:00:00Z',description:'SYNTHETIC',verified:true}]};assert.equal((await route().POST(req({...job,leads:[lead]}))).status,400);
 const r=new Request('https://synthetic.invalid/api/agents/prospecting',{method:'POST',headers:{'x-prospector-api-key':secret},body:' '.repeat(65537)});assert.equal((await route().POST(r)).status,413);
});
