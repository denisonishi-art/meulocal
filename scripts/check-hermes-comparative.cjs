const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const path=require('node:path');

function loadTS(file,deps={}){
 const js=ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  reportDiagnostics:true
 });
 assert.deepEqual(js.diagnostics.filter(d=>d.category===ts.DiagnosticCategory.Error),[]);
 const m={exports:{}};
 new Function('require','module','exports',js.outputText)(name=>deps[name]||require(name),m,m.exports);
 return m.exports;
}
const top=loadTS('lib/competitors/top-local-reputation.ts');
const builder=loadTS('lib/competitors/hermes-comparative-report.ts',{'./top-local-reputation':top});
const delivery=loadTS('lib/competitors/hermes-report-delivery.ts',{'./hermes-comparative-report':builder});
const hermes=require('../scripts/opendots-worker/commercial-engine.cjs');
const uuid='09876543-aaaa-4bbb-8ccc-123456789abc';
const diagId='11111111-2222-4333-8444-555555555555';
const leadId='22222222-2222-4333-8444-555555555555';
const center={latitude:-23.6,longitude:-46.6};
const googleId='ChIJplaceTest234567';
const detail={
 id:googleId,displayName:{text:'Wizard by Pearson Cursino'},formattedAddress:'Cursino, São Paulo, SP',
 primaryType:'school',types:['school'],location:center,rating:4,userRatingCount:5,businessStatus:'OPERATIONAL'
};
const p=(id,name,rating,reviewCount,latitude=-23.6,type='school')=>({
 id,displayName:{text:name},rating,userRatingCount:reviewCount,
 primaryType:type,types:[type],businessStatus:'OPERATIONAL',
 location:{latitude,longitude:-46.6}
});
const results=[
 p('ChIJoutsideschool','Fisk Outside',5,900,-23.64),
 p('ChIJprimaryschool','Colégio Ensino Fundamental',5,1000),
 p('ChIJoneReviewLang','Fisk Uma Estrela',5,1),
 p('ChIJfiskCursino','Fisk - Cursino',4.9,220),
 p('ChIJculturaCursino','Cultura Inglesa Cursino',4.8,310),
 p('ChIJCCAA','CCAA Saúde',4.7,180),
 p('ChIJCCAApoor','CCAA Longe',4.9,300,-23.635),
 p('ChIJveryLow','Escola de idiomas baixa',4.4,5),
 p('ChIJother','Restaurante Fisk',5,500,-23.6,'restaurant')
];
function googleFetch(calls,places=results){
 return async (url,options)=>{
  calls.push({url,options});
  if(options?.method==='POST')return {ok:true,json:async()=>({places})};
  return {ok:true,json:async()=>detail};
 };
}
test('explicit positive replies are recognized, negatives and vague questions are not',()=>{
 for(const v of ['Sim!','Pode enviar','Pode me enviar a análise?','Me manda a análise','Gostaria de receber a análise','Claro, pode mandar','Quero receber']){
  assert.equal(builder.asksForComparativeAnalysis(v),true,v);
 }
 for(const v of ['não','Sim, mas não tenho interesse','Qual o valor?','Como funciona?','Sair','Não envie','sim, não quero','', 'ok']){
  assert.equal(builder.asksForComparativeAnalysis(v),false,v);
 }
});
test('report uses three relevant Google Places within hard 3km and never invents a benchmark',async()=>{
 const calls=[];
 const report=await builder.buildTop3Report({placeId:googleId,niche:'escola de ingles',apiKey:'synthetic',fetchImpl:googleFetch(calls),now:new Date('2026-11-05T14:00:00Z')});
 assert.equal(calls.length,2);
 assert.match(String(calls[1].url),/places:searchText$/);
 assert.equal(JSON.parse(calls[1].options.body).locationBias.circle.radius,3000);
 assert.deepEqual(report.competitors.map(c=>c.id),['ChIJfiskCursino','ChIJculturaCursino','ChIJCCAA']);
 assert.equal(report.business.reviewCount,5);
 assert.equal(report.radiusMeters,3000);
 assert.ok(report.reviewGap>0);
 assert.equal(report.competitors.length,3);
 assert.equal(report.expiresAt,'2026-12-05T14:00:00.000Z');
 assert.ok(report.competitors.every(c=>c.distanceKm<=3));
});
test('insufficient actual competitors causes a hard failure, not a fabricated report',async()=>{
 await assert.rejects(builder.buildTop3Report({placeId:googleId,niche:'escola de idiomas',apiKey:'synthetic',fetchImpl:googleFetch([],results.filter(x=>x.id==='ChIJprimaryschool'))}),/no_reliable_local_competitors/);
});
const baseDiagnostic={id:diagId,public_token:uuid,place_id:googleId,business_name:detail.displayName.text,niche:'escola de idiomas'};
function fixture({permissionMessage='Sou Denis, fundador do MeuLocal. Posso preparar e enviar uma análise gratuita?',contactId='contact123',readyReport=null,reportEnabled=true}={}){
 const calls=[],rows={
  leads:{id:leadId,business_id:diagId,prospect_diagnostic_id:diagId,ghl_contact_id:contactId,opt_out_at:null,lifecycle_stage:'conversation'},
  manual_prospect_permissions:{place_id:googleId,name:detail.displayName.text,message:permissionMessage,contact_id:contactId,stage:'ready',created_at:new Date(Date.now()-40*60000).toISOString()},
  outreach_events:{id:'outbound',created_at:new Date(Date.now()-25*60000).toISOString()},
  businesses:{id:diagId,name:detail.displayName.text,google_place_id:googleId,address:'São Paulo'},
  prospect_diagnostics:baseDiagnostic,
  prospect_comparison_reports:readyReport&&{google_place_id:googleId,snapshot:readyReport,expires_at:readyReport.expiresAt}
 };
 const db={
  from(name){
   const chain={
    select(){return chain},eq(){return chain},in(){return chain},order(){return chain},limit(){return chain},
    async maybeSingle(){calls.push({name,op:'read'});return {data:rows[name]||null,error:null}},
    async upsert(record){calls.push({name,op:'write',record});if(!reportEnabled)return {error:{message:'fail'}};return {error:null}}
   };
   return chain;
  },
  async rpc(){throw Error('rpc_not_expected')}
 };
 return {db,calls,rows};
}
test('approved manual reply prepares one durable report and returns the correct link',async()=>{
 const f=fixture();
 const result=await delivery.prepareAnalysisForApprovedReply(f.db,{leadId,contactId:'contact123',message:'Sim!'},{
  apiKey:'synthetic',fetchImpl:googleFetch([])
 });
 assert.equal(result.status,'ready');
 assert.equal(result.url,'https://meulocal.ia.br/d/'+uuid);
 assert.equal(result.competitorCount,3);
 assert.ok(f.calls.some(c=>c.name==='prospect_comparison_reports'&&c.op==='write'));
});
test('out-of-scope GHL contact, negative reply or non-analysis original offer cannot generate a link',async()=>{
 const f=fixture();
 assert.equal(await delivery.prepareAnalysisForApprovedReply(f.db,{leadId,contactId:'wrong',message:'sim'},{apiKey:'synthetic',fetchImpl:async()=>{throw Error('unexpected_fetch')}}),null);
 assert.equal(await delivery.prepareAnalysisForApprovedReply(f.db,{leadId,contactId:'contact123',message:'não'},{apiKey:'synthetic',fetchImpl:async()=>{throw Error('unexpected_fetch')}}),null);
 const other=fixture({permissionMessage:'Sou do MeuLocal, gostaria de agendar uma conversa.'});
 assert.equal(await delivery.prepareAnalysisForApprovedReply(other.db,{leadId,contactId:'contact123',message:'sim'},{apiKey:'synthetic',fetchImpl:async()=>{throw Error('unexpected_fetch')}}),null);
 assert.ok(!f.calls.some(c=>c.op==='write'));
});
test('uncertain Google results remain unavailable and never produce a link',async()=>{
 const f=fixture();
 const result=await delivery.prepareAnalysisForApprovedReply(f.db,{leadId,contactId:'contact123',message:'Sim'},{apiKey:'synthetic',fetchImpl:googleFetch([],[])});
 assert.deepEqual(result,{status:'unavailable'});
 assert.ok(!f.calls.some(c=>c.op==='write'));
});
test('fresh stored report is reused without new Google request or DB writes',async()=>{
 const snapshot=await builder.buildTop3Report({placeId:googleId,niche:'escola de idiomas',apiKey:'synthetic',fetchImpl:googleFetch([])});
 const f=fixture({readyReport:snapshot});
 const result=await delivery.prepareAnalysisForApprovedReply(f.db,{leadId,contactId:'contact123',message:'pode mandar'},{apiKey:'synthetic',fetchImpl:async()=>{throw Error('unexpected_fetch')}});
 assert.equal(result.url,'https://meulocal.ia.br/d/'+uuid);
 assert.ok(!f.calls.some(c=>c.op==='write'));
});
const hermesEvent={
 kind:'meulocal.acquisition.inbound',eventId:'inbound-synthetic-123456',leadId,
 contactId:'contact123',message:'Sim',channel:'Email',permissions:{initialSend:false,autoReply:false,crmWrite:false}
};
test('Hermes responds with exact verified link without re-calling the LLM',async()=>{
 let modelCalls=0;
 const event={...hermesEvent,analysis:{status:'ready',url:'https://meulocal.ia.br/d/'+uuid,businessName:'Wizard by Pearson Cursino',competitorCount:3}};
 const result=await hermes.decideCommercialEvent(event,{modelTurn:async()=>{modelCalls++;throw Error('must_not_call_llm')}});
 assert.equal(result.action,'answer');
 assert.equal(result.channel,'email');
 assert.ok(result.message.includes(event.analysis.url));
 assert.match(result.message,/3 concorrentes/);
 assert.equal(modelCalls,0);
 assert.equal(result.requiresHumanReview,true);
 assert.equal(result.status,'suggestion_only');
});
test('Hermes fails closed for unavailable or malformed reports, with no accidental link',async()=>{
 for(const analysis of [{status:'unavailable'},{status:'ready',url:'https://evil.invalid/d/'+uuid,businessName:'Wizard',competitorCount:3}]){
  const response=await hermes.decideCommercialEvent({...hermesEvent,analysis},{modelTurn:async()=>{throw Error('must_not_call')}});
  assert.equal(response.action,'handoff');
  assert.equal(response.channel,'none');
  assert.equal(response.message,'');
 }
});
test('opt-out remains authoritative even with a report present',async()=>{
 const event={...hermesEvent,message:'SAIR',analysis:{status:'ready',url:'https://meulocal.ia.br/d/'+uuid,businessName:'Wizard',competitorCount:3}};
 const response=await hermes.decideCommercialEvent(event,{modelTurn:async()=>{throw Error('never')}});
 assert.equal(response.action,'stop');
});
