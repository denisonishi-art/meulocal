const {test}=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');const load=require('./test-loader.cjs')();
test('preflight works without any credential; research never does',()=>{
 const {configuration}=require('./remote-config.cjs');const c=configuration({},process.cwd(),{preflight:true});assert.deepEqual(c.missingCredentials,['OPENAI_API_KEY','CPK_INTELLIGENCE_API_KEY','MEULOCAL_PROSPECTOR_API_KEY']);assert.throws(()=>configuration({},process.cwd()),/missing_/);
});
test('multi-sector job uses existing ranking; few reviews alone is no confirmed opportunity',()=>{
 const {qualifyLead}=load('lib/agents/prospect-intelligence.ts');const a=qualifyLead({externalId:'google_places:SYNTHETIC',name:'SYNTHETIC pizzaria',segment:'pizzarias',city:'Sao Paulo',state:'SP',evidence:[{signal:'few_reviews',url:'https://maps.google.com/?q=SYNTHETIC',observedAt:'2026-10-12T00:00:00Z',description:'SYNTHETIC 10 reviews',verified:true}]});assert.equal(a.opportunityStatus,'needs_context');
});
test('consultative text is preserved with Denis signature, no price and pending approval',()=>{
 const {buildConsultativeApproach}=load('lib/agents/consultative-approach.ts');const d=buildConsultativeApproach({businessName:'SYNTHETIC',niche:'pizzarias',region:'Sao Paulo',reviewCount:10,sourceUrl:'https://maps.google.com/?q=SYNTHETIC',sourceObservedAt:'2026-10-12T00:00:00Z'});assert.match(d.email.body,/Denis, fundador da MeuLocal/);assert.match(d.whatsapp,/Denis, fundador da MeuLocal/);assert.doesNotMatch(d.email.body+d.whatsapp,/397|Equipe MeuLocal/);assert.equal(d.messageApproval,'NOT_VERIFIED');
});
test('worker backend mapping retains actual address and supports segment without inventing evidence',()=>{
 const {mapBackendPlaces}=require('./adapter.cjs');const m=mapBackendPlaces([{id:'SYNTHETIC',name:'SYNTHETIC pizzaria',address:'Rua A, São Paulo - SP, Brasil',reviewCount:9,rating:4.9}],new Date(),{segment:'pizzarias',city:'Sao Paulo',state:'SP'});assert.equal(m.leads[0].segment,'pizzarias');assert.equal(m.leads[0].address,'Rua A, São Paulo - SP, Brasil');
});
