const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
const base=fs.readFileSync(path.join(__dirname,'check-payment-database.cjs'),'utf8').split('const id=n=>')[0];
const {sql}=new Function('require','__dirname','process',base+'\nreturn {sql};')(require,__dirname,process);
for(const file of ['20261015_004_payment_event_processing.sql','20261015_005_checkout_creation_recovery.sql']){const target=path.join(root,'supabase/migrations',file);if(fs.existsSync(target))sql(fs.readFileSync(target,'utf8'))}
const q=value=>value==null?'null':"'"+String(value).replaceAll("'","''")+"'";
const json=source=>JSON.parse(sql(source));
function fixture(){const business=crypto.randomUUID(),lead=crypto.randomUUID(),email='payer-'+business+'@example.invalid';sql(`insert into businesses(id,name) values(${q(business)},'Synthetic checkout');insert into leads(id,business_id,email) values(${q(lead)},${q(business)},${q(email)})`);return {business,lead,email}}
const reserve=f=>json(`select reserve_payment_checkout(${q(f.business)},${q(f.lead)},'Synthetic',${q(f.email)},null,39700)`);
const finish=(r,id='synthetic-checkout-'+crypto.randomUUID())=>json(`select finish_payment_checkout(${q(r.checkoutId)},${q(r.lease)},${q(id)})`);
test('local intent and account are saved before provider work; retries cannot request a second checkout',()=>{const f=fixture(),a=reserve(f);assert.equal(a.state,'create');assert.ok(a.reference);assert.ok(a.lease);assert.equal(reserve(f).state,'reconcile');assert.equal(sql(`select count(*) from payment_checkouts where business_id=${q(f.business)}`),'1')});
test('provider result is saved once and subsequent requests reuse its URL',()=>{const f=fixture(),a=reserve(f),id='synthetic-checkout-'+crypto.randomUUID();const saved=finish(a,id);assert.ok(saved.checkoutUrl.endsWith(id));assert.equal(reserve(f).checkoutUrl,saved.checkoutUrl);assert.equal(finish(a,id).checkoutUrl,saved.checkoutUrl);assert.throws(()=>finish(a,'different'),/payment_checkout_identity_conflict/)});
test('ambiguous provider failure stays recoverable and never automatically creates a replacement',()=>{const f=fixture(),a=reserve(f);assert.equal(sql(`select defer_checkout_creation(${q(a.checkoutId)},${q(a.lease)})`),'t');assert.equal(reserve(f).state,'reconcile');assert.equal(sql(`select creation_state from payment_checkouts where id=${q(a.checkoutId)}`),'unknown');assert.ok(finish(a).checkoutUrl)});
test('customer scope and official price are checked before any intent exists',()=>{const f=fixture();assert.throws(()=>reserve({...f,email:'different@example.invalid'}),/payment_checkout_customer_conflict/);assert.throws(()=>json(`select reserve_payment_checkout(${q(f.business)},${q(f.lead)},'Synthetic',${q(f.email)},null,1)`),/payment_checkout_amount_conflict/);assert.equal(sql(`select count(*) from payment_checkouts where business_id=${q(f.business)}`),'0')});
test('existing onboarding is preserved and active or past-due contracts cannot be recharged',()=>{const f=fixture();sql(`insert into customer_accounts(business_id,onboarding_status) values(${q(f.business)},'completed')`);reserve(f);assert.equal(sql(`select onboarding_status from customer_accounts where business_id=${q(f.business)}`),'completed');sql(`update customer_accounts set payment_status='active' where business_id=${q(f.business)}`);assert.equal(reserve(f).state,'active');sql(`update customer_accounts set payment_status='past_due',external_subscription_id='synthetic-sub' where business_id=${q(f.business)}`);assert.equal(reserve(f).state,'existing_contract')});
test('a paid checkout awaiting access prevents a new financial operation',()=>{const f=fixture(),a=reserve(f);sql(`update payment_checkouts set status='paid' where id=${q(a.checkoutId)}`);assert.equal(reserve(f).state,'payment_processing');assert.equal(sql(`select count(*) from payment_checkouts where business_id=${q(f.business)}`),'1')});
test('only confirmed cancellation or expiration permits another checkout intent',()=>{const f=fixture(),a=reserve(f);sql(`update payment_checkouts set status='expired' where id=${q(a.checkoutId)}`);assert.equal(reserve(f).state,'create')});
test('provider completion cannot undo a payment processed before its HTTP response',()=>{const f=fixture(),a=reserve(f);sql(`update payment_checkouts set status='paid' where id=${q(a.checkoutId)}`);finish(a);assert.equal(sql(`select status from payment_checkouts where id=${q(a.checkoutId)}`),'paid')});
test('browser roles cannot reserve or complete financial intents',()=>{for(const role of ['anon','authenticated'])for(const signature of ['reserve_payment_checkout(uuid,uuid,text,text,text,integer)','finish_payment_checkout(uuid,uuid,text)','defer_checkout_creation(uuid,uuid)'])assert.equal(sql(`select has_function_privilege('${role}',${q(signature)},'EXECUTE')`),'f')});

function checkoutRoute(f,{providerFailure=false,saveFailure=false,lostCommitResponse=false}={}){
 let calls=0;const db={rpc:async(name,args)=>{
  assert.ok(['reserve_payment_checkout','finish_payment_checkout','defer_checkout_creation'].includes(name));
  if(name==='finish_payment_checkout'&&saveFailure){saveFailure=false;return {error:{message:'synthetic_save_failed'}}}
  const params=Object.entries(args).map(([key,value])=>{assert.match(key,/^p_[a-z_]+$/);return key+'=>'+q(value)});
  try{const data=json('select to_jsonb('+name+'('+params.join(',')+'))');if(name==='finish_payment_checkout'&&lostCommitResponse){lostCommitResponse=false;return {error:{message:'synthetic_commit_response_lost'}}}return {data}}catch(error){return {error:{message:error.message}}}
 }};
 const module={exports:{}};
 const source=ts.transpileModule(fs.readFileSync(path.join(root,'app/api/payments/checkout/route.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const req=name=>{
  if(name==='next/server')return {NextResponse:{json:(data,options={})=>({status:options.status||200,data})}};
  if(name==='@supabase/supabase-js')return {createClient:()=>db};
  if(name==='@/lib/rate-limit')return {consumeRateLimit:async()=>({allowed:true})};
  if(name==='@/lib/agents/business-rules')return {meulocalBusinessRules:{commercial:{officialMonthlyPriceBRL:397}}};
  if(name==='@/lib/payments/asaas')return {ensureAsaasConfigured:()=>true,createRecurringCheckout:async input=>{
   calls++;assert.equal(sql(`select count(*) from payment_checkouts where business_id=${q(f.business)} and external_reference=${q(input.externalReference)}`),'1');
   if(providerFailure)throw Error('synthetic_provider_timeout');return {id:'synthetic-provider-'+f.business};
  }};
  throw Error('unexpected_import:'+name);
 };
 vm.runInNewContext('(function(require,module,exports){'+source+'\n})',{process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://synthetic.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service'}},Buffer,AbortSignal})(req,module,module.exports);
 return {send:input=>module.exports.POST({text:async()=>JSON.stringify(input||{name:'Synthetic',email:f.email,businessId:f.business,leadId:f.lead})}),calls:()=>calls};
}
test('actual route saves its intent before provider work and repeated requests reuse one result',async()=>{const f=fixture(),route=checkoutRoute(f);const first=await route.send();assert.equal(first.status,200);assert.deepEqual((await route.send()).data,first.data);assert.equal(route.calls(),1)});
test('two concurrent route requests cannot issue two provider operations',async()=>{const f=fixture(),route=checkoutRoute(f);const results=await Promise.all([route.send(),route.send()]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(route.calls(),1)});
test('provider timeout leaves a durable unknown intent and retry never recreates checkout',async()=>{const f=fixture(),route=checkoutRoute(f,{providerFailure:true});assert.equal((await route.send()).status,503);assert.equal((await route.send()).status,409);assert.equal(route.calls(),1);assert.equal(sql(`select creation_state from payment_checkouts where business_id=${q(f.business)}`),'unknown')});
test('failed provider-result save preserves the intent and does not issue another request',async()=>{const f=fixture(),route=checkoutRoute(f,{saveFailure:true});assert.equal((await route.send()).status,503);assert.equal((await route.send()).status,409);assert.equal(route.calls(),1)});
test('lost response after provider-result commit reuses its saved URL',async()=>{const f=fixture(),route=checkoutRoute(f,{lostCommitResponse:true});assert.equal((await route.send()).status,503);assert.equal((await route.send()).status,200);assert.equal(route.calls(),1)});
test('invalid customer scope is rejected before calling provider',async()=>{const f=fixture(),route=checkoutRoute(f);assert.equal((await route.send({name:'Synthetic',email:'other@example.invalid',businessId:f.business,leadId:f.lead})).status,409);assert.equal(route.calls(),0)});
