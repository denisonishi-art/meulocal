const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');

function load(source,deps={}){
 const js=ts.transpileModule(fs.readFileSync(source,'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
 }).outputText;
 const m={exports:{}};
 new Function('require','module','exports',js)(name=>deps[name]||require(name),m,m.exports);
 return m.exports;
}
const statuses=load('lib/agents/diagnostic-contact-status.ts');
const event=(type,channel='email',date='2026-11-05T13:00:00Z')=>({event_type:type,channel,created_at:date,provider:'highlevel'});

test('a saved diagnostic or a queued operation is not counted as a sent message',()=>{
 const saved=statuses.diagnosticContactStatus([]);
 assert.equal(saved.state,'saved');
 assert.match(saved.label,/sem envio registrado/);
 const queued=statuses.diagnosticContactStatus([event('queued')]);
 assert.equal(queued.state,'queued');
 assert.match(queued.label,/não confirmado/);
});
test('sent means recorded, not confirmed delivered; replies have separate evidence',()=>{
 const sent=statuses.diagnosticContactStatus([event('queued'),event('sent')]);
 assert.equal(sent.state,'sent');
 assert.match(sent.label,/entrega não confirmada/);
 assert.equal(sent.channel,'email');
 const replied=statuses.diagnosticContactStatus([event('sent'),event('replied','whatsapp')]);
 assert.equal(replied.state,'replied');
 assert.match(replied.label,/Resposta registrada/);
});
test('unknown event types and later failures never create false delivery claims',()=>{
 const unknown=statuses.diagnosticContactStatus([event('unverified')]);
 assert.equal(unknown.state,'saved');
 const failure=statuses.diagnosticContactStatus([event('queued'),event('failed')]);
 assert.equal(failure.state,'failed');
 const delivered=statuses.diagnosticContactStatus([event('sent'),event('delivered')]);
 assert.equal(delivered.state,'delivered');
});
const placeId='ChIJtestGooglePlace987';
const token='01234567-89ab-4cde-8fff-123456789abc';
const id1='11111111-2222-4333-8444-555555555555';
const id2='22222222-2222-4333-8444-555555555555';
const l1='33333333-2222-4333-8444-555555555555';
const l2='44444444-2222-4333-8444-555555555555';
const diagnostics=[
 {id:id1,public_token:token,place_id:placeId,business_name:'Wizard Cursino',niche:'escola de ingles',region:'São Paulo',status:'approved',created_at:'2026-11-05T15:32:18Z'},
 {id:id2,public_token:'abcdef00-89ab-4cde-8fff-123456789abc',place_id:'ChIJolderExample987',business_name:'Outra empresa',niche:'restaurante',region:'São Paulo',status:'contacted',created_at:'2026-10-09T15:32:18Z'}
];
function database(fixtures,errors={}){
 return {
  from(name){
   let rows=fixtures[name]||[];
   const query={
    select(){return query},
    in(field,ids){rows=rows.filter(x=>ids.includes(x[field]));return query},
    order(field,{ascending}={ascending:true}){rows=[...rows].sort((a,b)=>ascending?String(a[field]).localeCompare(String(b[field])):String(b[field]).localeCompare(String(a[field])));return query},
    limit(amount){return Promise.resolve(errors[name]?{error:{message:'unavailable'},data:null}:{data:rows.slice(0,amount),error:null})}
   };
   return query;
  }
 };
}
function mockedRoute(fixtures,errors={},authorized=true){
 return load('app/api/admin/prospects/diagnostics/route.ts',{
  'next/server':{NextResponse:{json:(body,opts={})=>Response.json(body,opts)}},
  '@supabase/supabase-js':{createClient:()=>database(fixtures,errors)},
  '@/lib/admin-auth':{isAdminRequest:async()=>authorized},
  '@/lib/agents/diagnostic-contact-status':statuses
 });
}
const fixtures={
 prospect_diagnostics:diagnostics,
 leads:[{id:l1,prospect_diagnostic_id:id1},{id:l2,prospect_diagnostic_id:id2}],
 outreach_events:[{...event('sent'),lead_id:l2},{...event('queued'),lead_id:l2}],
 prospect_comparison_reports:[{
  diagnostic_id:id1,google_place_id:placeId,expires_at:new Date(Date.now()+86400000).toISOString(),
  snapshot:{version:'meulocal_top3_v1',radiusMeters:3000,competitors:[{id:'peer'}]}
 }]
};
test('catalog lists selected schools even when older leads have contact records',async()=>{
 const oldUrl=process.env.NEXT_PUBLIC_SUPABASE_URL,oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://synthetic.supabase.invalid';
 process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic_service';
 try{
  const api=mockedRoute(fixtures);
  const response=await api.GET(new Request('https://test.invalid/api/admin/prospects/diagnostics'));
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.total,2);
  assert.equal(data.diagnostics[0].business_name,'Wizard Cursino');
  assert.equal(data.diagnostics[0].contact.state,'saved');
  assert.equal(data.diagnostics[0].reportReady,true);
  assert.equal(data.diagnostics[0].reportCount,1);
  assert.equal(data.diagnostics[1].contact.state,'sent');
  assert.match(data.diagnostics[1].contact.label,/entrega não confirmada/);
  assert.match(response.headers.get('cache-control'),/no-store/);
 }finally{
  if(oldUrl===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=oldUrl;
  if(oldKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey;
 }
});
test('catalog fails closed on unauthorized request and incomplete evidence query',async()=>{
 const denied=await mockedRoute(fixtures,{},false).GET(new Request('https://test.invalid/admin'));
 assert.equal(denied.status,401);
 const oldUrl=process.env.NEXT_PUBLIC_SUPABASE_URL,oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://synthetic.supabase.invalid';
 process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic_service';
 try{
  const response=await mockedRoute(fixtures,{outreach_events:true}).GET(new Request('https://test.invalid/admin'));
  assert.equal(response.status,503);
  const data=await response.json();
  assert.match(data.error,/histórico de contato|Histórico incompleto/i);
 }finally{
  if(oldUrl===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=oldUrl;
  if(oldKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey;
 }
});
test('front-end displays search, full catalog and report buttons without sending',()=>{
 const ui=fs.readFileSync('app/admin/AdminClient.tsx','utf8');
 assert.match(ui,/Buscar diagnóstico por nome/);
 assert.match(ui,/Gerar análise \(sem enviar\)/);
 assert.match(ui,/reviewableDiagnostics\.slice\(0,20\)/);
 assert.match(ui,/loadCatalog\(\)/);
 assert.doesNotMatch(ui,/até 15 mais recentes/);
 assert.doesNotMatch(ui,/openWhatsAppDraft/);
});
