const assert=require('node:assert/strict');
const {test}=require('node:test');
const loader=require('./opt-out-test-loader.cjs');
const locationId='uNh3KsM7WFuLeTN8Q583',contactId='SYNTHETIC-contact';
const lead={id:'SYNTHETIC-lead',business_id:'SYNTHETIC-business',ghl_location_id:locationId,ghl_contact_id:contactId,created_at:'2026-10-10T00:00:00Z'};
async function env(fn){
 const values={CRON_SECRET:'SYNTHETIC',GHL_WEBHOOK_SECRET:'SYNTHETIC',GHL_LOCATION_ID:locationId,NEXT_PUBLIC_SUPABASE_URL:'https://synthetic.invalid',SUPABASE_SERVICE_ROLE_KEY:'SYNTHETIC'};
 const old=Object.fromEntries(Object.keys(values).map(k=>[k,process.env[k]]));Object.assign(process.env,values);
 try{return await fn()}finally{for(const k of Object.keys(values))if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}
}
function dbMock({duplicate=false,fail=false,leads=[lead]}={}){
 const calls=[],filters=[];
 return {calls,filters,async rpc(name,args){if(name==='replay_meulocal_inbound_events')return {data:{states:[]}};calls.push({name,args});return fail?{error:{message:'SYNTHETIC sensitive failure'}}:{data:{duplicate,customerFlow:true,acquisitionFlow:true,state:args.p_event.classification}}},from(table){
    const q={select(){return q},insert(){return q},update(){return q},eq(k,v){filters.push([table,k,v]);return q},in(){return q},is(k,v){filters.push([table,k,v]);return q},not(){return q},order(){return q},limit(){return q},maybeSingle(){return Promise.resolve(result())},then(a,b){return Promise.resolve(result()).then(a,b)}};
  function result(){return table==='leads'?{data:leads}:table==='ghl_events'?{error:duplicate?{code:'23505'}:null}:table==='customer_contacts'?{data:{id:'SYNTHETIC-customer',business_id:'SYNTHETIC-business'}}:{data:null};}return q;
 }};
}
function stubs(db,messages=[]){return {'next/server':{NextResponse:Response},'@supabase/supabase-js':{createClient:()=>db},'@/lib/highlevel-operational':{getLocationAccessToken:async()=>'SYNTHETIC',findOperationalConversation:async()=> 'SYNTHETIC-conversation',getOperationalConversationMessages:async()=>messages,removeOperationalTags:async()=>{throw Error('remote write forbidden')}}};}
function message(id,text,dateAdded='2026-10-12T00:00:00Z'){return {id,body:text,direction:'inbound',dateAdded,messageType:'email'};}
test('explicit refusal, common reply and inconclusive classification are separate',()=>{
 const {classifyInboundState}=loader()('lib/agents/inbound-intent.ts');
 for(const [body,want] of [['SAIR','explicit_refusal'],['Não quero','explicit_refusal'],['Quanto custa?','common_reply'],['Tenho interesse','common_reply'],['Não quero cancelar agora','inconclusive'],['','inconclusive'],[null,'inconclusive']])assert.equal(classifyInboundState(body),want);
});
test('polling persists every eligible message, including refusal before a later common reply',async()=>env(async()=>{
 const db=dbMock();const {GET}=loader(stubs(db,[message('SYNTHETIC-stop','SAIR'),message('SYNTHETIC-common','Olá','2026-10-12T01:00:00Z')]))('app/api/cron/acquisition-replies/route.ts');
 const res=await GET(new Request('https://synthetic.invalid/cron',{headers:{authorization:'Bearer SYNTHETIC'}}));assert.equal(res.status,200);
 assert.equal(db.calls.length,2);assert.deepEqual(db.calls.map(c=>c.args.p_event.classification),['explicit_refusal','common_reply']);
 assert.ok(db.filters.some(([t,k,v])=>t==='leads'&&k==='ghl_location_id'&&v===locationId));
  assert.ok(!db.filters.some(([t,k])=>t==='leads'&&k==='last_reply_at'),'a later refusal must remain observable after a common reply');
}));
test('polling persistence failures are observable and wrong tenant cannot use the acquired token',async()=>env(async()=>{
 for(const extra of [{fail:true},{leads:[{...lead,ghl_location_id:'other-location'}]}]){
  const db=dbMock(extra);const {GET}=loader(stubs(db,[message('SYNTHETIC-id','SAIR')]))('app/api/cron/acquisition-replies/route.ts');
  const res=await GET(new Request('https://synthetic.invalid/cron',{headers:{authorization:'Bearer SYNTHETIC'}}));assert.equal(res.status,503);assert.equal((await res.json()).ok,false);
  if(extra.leads)assert.equal(db.calls.length,0);
 }
}));
test('webhook duplicates reach the transactional processor and customer events do not hide acquisition',async()=>env(async()=>{
 const db=dbMock({duplicate:true});const {POST}=loader(stubs(db))('app/api/webhooks/highlevel/route.ts');
 const res=await POST(new Request('https://synthetic.invalid/webhook',{method:'POST',headers:{'x-meulocal-webhook-token':'SYNTHETIC'},body:JSON.stringify({messageId:'SYNTHETIC-id',locationId,contactId,direction:'inbound',body:'SAIR'})}));
 assert.equal(res.status,200);assert.equal(db.calls.length,1);const body=await res.json();assert.equal(body.customerFlow,true);assert.equal(body.acquisitionFlow,true);
}));
test('webhook boolean strings, DND changes and event-name heuristics do not become definitive refusal',async()=>env(async()=>{
 for(const payload of [{type:'ContactDndUpdate',dnd:false},{type:'unsubscribe',optedOut:'false'},{dnd:true},{direction:'inbound',body:'Não quero cancelar agora'}]){
  const db=dbMock();const {POST}=loader(stubs(db))('app/api/webhooks/highlevel/route.ts');
  await POST(new Request('https://synthetic.invalid/webhook',{method:'POST',headers:{'x-meulocal-webhook-token':'SYNTHETIC'},body:JSON.stringify({eventId:'SYNTHETIC-event',locationId,contactId,...payload})}));
  assert.equal(db.calls.length,1);assert.notEqual(db.calls[0].args.p_event.classification,'explicit_refusal');
 }
}));
test('webhook partial failure returns retryable error without leaking provider diagnostics',async()=>env(async()=>{
 const db=dbMock({fail:true});const {POST}=loader(stubs(db))('app/api/webhooks/highlevel/route.ts');
 const res=await POST(new Request('https://synthetic.invalid/webhook',{method:'POST',headers:{'x-meulocal-webhook-token':'SYNTHETIC'},body:JSON.stringify({messageId:'SYNTHETIC-id',locationId,contactId,direction:'inbound',body:'SAIR'})}));
 assert.equal(res.status,503);assert.ok(!JSON.stringify(await res.json()).includes('sensitive'));
}));

test('outreach cron classifies refusals/common/inconclusive and never sends after a reply or persistence failure',async()=>env(async()=>{
 for(const [text,want,fail] of [['SAIR','explicit_refusal',false],['Olá','common_reply',false],['Não quero cancelar agora','inconclusive',false],['SAIR','explicit_refusal',true]]){
  const calls=[];let sends=0;
  const db={async rpc(name,args){if(name==='replay_meulocal_inbound_events')return {data:{states:[]}};calls.push({name,args});return fail?{error:{message:'SYNTHETIC'}}:{data:{duplicate:false,customerFlow:false,acquisitionFlow:true,state:args.p_event.classification}}},from(table){
   const q={select(){return q},eq(){return q},not(){return q},lte(){return q},order(){return q},limit(){return q},update(){return q},maybeSingle(){return Promise.resolve(result())},then(a,b){return Promise.resolve(result()).then(a,b)}};
   function result(){return table==='automation_enrollments'?{data:[{id:'SYNTHETIC-enrollment',lead_id:lead.id,step:1}]}:table==='leads'?{data:{...lead,lifecycle_stage:'mql',opt_out_at:null,last_reply_at:null}}:table==='outreach_events'?{data:{conversation_id:'SYNTHETIC-conversation',created_at:'2026-10-10T00:00:00Z'}}:{data:null};}return q;
  }};
  const old=process.env.MEULOCAL_ACQUISITION_OUTREACH_ENABLED,oldLoc=process.env.GHL_INTERNAL_LOCATION_ID;
  process.env.MEULOCAL_ACQUISITION_OUTREACH_ENABLED='true';process.env.GHL_INTERNAL_LOCATION_ID=locationId;
  try{
   const deps=stubs(db,[message('SYNTHETIC-cron-message',text)]);deps['@/lib/highlevel-operational'].sendOperationalMessage=async()=>{sends++;return {}};
   const {POST}=loader(deps)('app/api/cron/acquisition-outreach/route.ts');const res=await POST(new Request('https://synthetic.invalid/cron',{method:'POST',headers:{authorization:'Bearer SYNTHETIC'}}));
   assert.equal(calls.length,1);assert.equal(calls[0].args.p_event.classification,want);assert.equal(sends,0);
   const result=await res.json();assert.equal(fail?result.failed:result.stopped,1);
  }finally{if(old===undefined)delete process.env.MEULOCAL_ACQUISITION_OUTREACH_ENABLED;else process.env.MEULOCAL_ACQUISITION_OUTREACH_ENABLED=old;if(oldLoc===undefined)delete process.env.GHL_INTERNAL_LOCATION_ID;else process.env.GHL_INTERNAL_LOCATION_ID=oldLoc;}
 }
}));

test('unmapped durable reply returns retryable failure and local replay blocks cadence without newer messages',async()=>{
 const {persistLocalInbound,reconcileAcquisitionMessages,normalizeLocalInbound}=loader()('lib/meulocal-inbound.ts');
 const event=normalizeLocalInbound({locationId,contactId,direction:'inbound',body:'SAIR'},'highlevel_webhook');
 await assert.rejects(persistLocalInbound({rpc:async()=>({data:{duplicate:false,pending:true,customerFlow:false,acquisitionFlow:false,state:'explicit_refusal'}})},event),/inbound_persistence_failed/);
 const calls=[];const db={rpc:async(name,args)=>{calls.push({name,args});return {data:{states:['explicit_refusal']}}}};
 const result=await reconcileAcquisitionMessages(db,{scope:{locationId,contactId},messages:[],since:'2026-10-10T00:00:00Z',conversationId:'SYNTHETIC',source:'highlevel_poll'});
 assert.equal(result.stopped,true);assert.deepEqual(calls[0].args,{p_location_id:locationId,p_contact_id:contactId});
 await assert.rejects(reconcileAcquisitionMessages({rpc:async()=>({error:{message:'SYNTHETIC'}})},{scope:{locationId,contactId},messages:[],since:'2026-10-10T00:00:00Z',conversationId:'SYNTHETIC',source:'highlevel_poll'}),/inbound_replay_failed/);
});
