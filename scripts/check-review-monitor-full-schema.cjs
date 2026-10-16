// Local owned PostgreSQL only. No provider or external message transport.
const fs=require('node:fs'),assert=require('node:assert/strict'),{spawnSync,spawn}=require('node:child_process');
const container='meulocal-opendots-recovery-test-platform-20261015',database=process.env.MEULOCAL_MONITOR_TEST_DB||'meulocal_review_monitor_20261016_03';
if(!/^meulocal_review_monitor_\d{8}(?:_\d+)?$/.test(database))throw Error('owned_database_required');
const inspect=spawnSync('docker',['inspect','--format','{{index .Config.Labels "codex.owner"}}',container],{encoding:'utf8'});if(inspect.status||inspect.stdout.trim()!=='meulocal-platform-20261015')throw Error('owned_container_required');
const args=['exec','-i',container,'psql','-X','-U','supabase_admin','-d',database,'-v','ON_ERROR_STOP=1','-qtA'];
const namespace=require('node:crypto').randomBytes(5).toString('hex'),qualify=s=>s.replaceAll('synthetic-','synthetic-'+namespace+'-');
function sql(s){s=qualify(s);const r=spawnSync('docker',args,{input:s,encoding:'utf8'});if(r.status)throw Error(r.stderr);return r.stdout.trim()}
const json=s=>JSON.parse(sql(s)||'null'),q=s=>"'"+s.replaceAll("'","''")+"'";
let cases=0;const b=require('node:crypto').randomUUID(),u=require('node:crypto').randomUUID();
function alert(review){return json(`insert into review_monitor_alerts(business_id,review_id,version,rating,verdict,state,review_published_at,deadline_at) values('${b}',${q(review)},'v1',1,'negative','pending',now(),now()+interval '3 hours') returning row_to_json(review_monitor_alerts)`)}
function claim(){return json(`select claim_review_monitor_alert('${b}')`)}
function prepare(job){sql(`update review_monitor_alerts set state='dispatching',ghl_contact_id='synthetic-owner',dispatch_started_at=now() where id='${job.id}'`)}
function accept(job,msg){return json(`select accept_review_monitor_alert('${job.id}','${job.lease}',${q(msg)},'synthetic-location')`)}
function receipt(msg,status='delivered',location='synthetic-location'){return json(`select record_review_monitor_receipt(${q(location)},${q(msg)},'synthetic-owner',${q(status)})`)}
(async()=>{
 assert.match(sql('show server_version'),/^17\.6/);assert.equal(Number(sql("select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'")),38);cases++;
 sql(`insert into auth.users(id,email,email_confirmed_at) values('${u}','monitor-fixture@example.invalid',now());insert into businesses(id,name) values('${b}','Synthetic monitor schema rehearsal');insert into customer_accounts(business_id,user_id,payment_status,paid_at) values('${b}','${u}','active',now());`);
 assert.throws(()=>sql(`select record_customer_onboarding('${u}','completed',true,true)`),/onboarding_google_required/);assert.throws(()=>sql(`select activate_customer_base('${b}','${u}')`),/customer_base_google_required/);cases++;
 const first=alert('synthetic-early');const early=claim();prepare(early);assert.equal(receipt('synthetic-early-message').matched,0);assert.equal(accept(early,'synthetic-early-message').state,'delivered');cases++;
 receipt('synthetic-early-message','failed');assert.equal(sql(`select state from review_monitor_alerts where id='${first.id}'`),'delivered');assert.equal(receipt('synthetic-early-message').matched,0);cases++;
 alert('synthetic-late');const late=claim();prepare(late);assert.equal(accept(late,'synthetic-late-message').state,'accepted');assert.equal(receipt('synthetic-late-message','delivered','other-location').matched,0);assert.equal(sql(`select state from review_monitor_alerts where id='${late.id}'`),'accepted');assert.equal(receipt('synthetic-late-message').matched,1);cases++;
 alert('synthetic-uncertain');const uncertain=claim();prepare(uncertain);accept(uncertain,'synthetic-uncertain-message');sql(`update review_monitor_alerts set state='uncertain' where id='${uncertain.id}'`);assert.equal(receipt('synthetic-uncertain-message').matched,1);assert.equal(sql(`select state from review_monitor_alerts where id='${uncertain.id}'`),'delivered');cases++;
 assert.throws(()=>sql(`select accept_review_monitor_alert('${late.id}',gen_random_uuid(),'bad','synthetic-location')`),/monitor_acceptance_scope_invalid/);cases++;
 assert.equal(json("select claim_review_monitor_alert('00000000-0000-4000-8000-000000000099')"),null);cases++;
 assert.throws(()=>alert('synthetic-early'),/duplicate key/);cases++;
 for(const role of ['anon','authenticated']){for(const command of ['select * from review_monitor_alerts','select * from review_monitor_receipts','select claim_review_monitor_alert()',"select record_review_monitor_receipt('x','y','z','delivered')",`select record_customer_onboarding_before_monitoring('${u}','completed',true,true)`])assert.throws(()=>sql('set role '+role+';'+command),/permission denied/)}cases++;
 // Force receipt-first concurrency: stdout marker is emitted only after the shared advisory lock is held.
 alert('synthetic-race');const race=claim();prepare(race);let acceptTask;
 await new Promise((resolve,reject)=>{const child=spawn('docker',args);let output='',err='';child.stdout.on('data',data=>{output+=data;if(!acceptTask&&output.includes('MONITOR_LOCKED')){acceptTask=new Promise((ok,fail)=>{const a=spawn('docker',args);let body='',error='';a.stdout.on('data',x=>body+=x);a.stderr.on('data',x=>error+=x);a.on('close',code=>code?fail(Error(error)):ok(body));a.stdin.end(qualify(`select accept_review_monitor_alert('${race.id}','${race.lease}','synthetic-race-message','synthetic-location')`))});}});child.stderr.on('data',x=>err+=x);child.on('close',code=>code?reject(Error(err)):resolve());child.stdin.end(qualify("begin;select pg_advisory_xact_lock(hashtextextended('synthetic-location:synthetic-race-message:synthetic-owner',0));select 'MONITOR_LOCKED';select pg_sleep(0.5);select record_review_monitor_receipt('synthetic-location','synthetic-race-message','synthetic-owner','delivered');commit;"));});
 await acceptTask;assert.equal(sql(`select state from review_monitor_alerts where id='${race.id}'`),'delivered');cases++;
 console.log(JSON.stringify({status:'PASS',cases,postgres:sql('show server_version'),baseline:'fresh production public DDL; auth dependency stubs; synthetic rows only',remoteRequests:0,realSends:0}));
})().catch(error=>{console.error(error.message);process.exitCode=1});
