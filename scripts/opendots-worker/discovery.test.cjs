const {test}=require('node:test');const assert=require('node:assert/strict');const load=require('./test-loader.cjs')();
test('shared Google source preserves missing counts and actual geography; bounded provider request',async()=>{
 const {discoverGooglePlaces}=load('lib/agents/places-discovery.ts');const calls=[];
 const result=await discoverGooglePlaces('pizzarias em Sao Paulo SP',5,'SYNTHETIC_GOOGLE',async(url,init)=>{calls.push({url,init});return Response.json({places:[{id:'SYNTHETIC',displayName:{text:'SYNTHETIC pizzaria'},formattedAddress:'Rua A, Osasco - SP',addressComponents:[{types:['country'],shortText:'BR'}],rating:4.5}]})});
 assert.equal(calls.length,1);assert.equal(JSON.parse(calls[0].init.body).pageSize,5);assert.equal(result.places[0].reviewCount,null);assert.equal(result.places[0].address,'Rua A, Osasco - SP');assert.equal(result.places[0].businessStatus,null);assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC_GOOGLE/);
});
test('private discovery requires dedicated key and enable flag; never accepts CRON_SECRET',async()=>{
 process.env.MEULOCAL_PROSPECTOR_API_KEY='SYNTHETIC_DEDICATED';process.env.CRON_SECRET='SYNTHETIC_CRON';delete process.env.MEULOCAL_RESEARCH_ENABLED;const {POST}=load('app/api/agents/prospecting/discover/route.ts');
 assert.equal((await POST(new Request('https://synthetic.invalid',{method:'POST',headers:{authorization:'Bearer SYNTHETIC_CRON'},body:'{}'}))).status,401);
 assert.equal((await POST(new Request('https://synthetic.invalid',{method:'POST',headers:{'x-prospector-api-key':'SYNTHETIC_DEDICATED'},body:'{}'}))).status,423);
});
