const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const container=process.env.OPENDOTS_TEST_PG_CONTAINER;
if(!container||!container.startsWith('meulocal-opendots-recovery-test-platform-'))throw Error('owned_platform_container_required');
const ownership=spawnSync('docker',['inspect','--format','{{index .Config.Labels "codex.owner"}}',container],{encoding:'utf8'});
if(ownership.status||ownership.stdout.trim()!=='meulocal-platform-20261015')throw Error('container_owner_mismatch');
const database='meulocal_inbox_test_'+process.pid;
function sql(input,db=database){const r=spawnSync('docker',['exec','-i',container,'psql','-X','-U','supabase_admin','-d',db,'-v','ON_ERROR_STOP=1','-tA'],{input,encoding:'utf8'});if(r.status)throw Error(r.stderr);return r.stdout.trim()}
sql('create database '+database,'postgres');console.log('isolated_database='+database);
const root=path.resolve(__dirname,'..');const core=fs.readFileSync(path.join(root,'supabase/migrations/20260828_001_core.sql'),'utf8'),access=fs.readFileSync(path.join(root,'supabase/migrations/20260917_001_customer_access_and_platform.sql'),'utf8');
function table(s,n){const start=s.indexOf('create table if not exists '+n+' (');return s.slice(start,s.indexOf('\n);',start)+3)}
const next=path.join(root,'supabase/migrations/20261015_002_controlled_inbox_cursor.sql');
sql(`create schema auth;create table auth.users(id uuid primary key);create extension citext;
do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon;end if;if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated;end if;if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role;end if;end $$;
${['businesses','leads','outreach_events','automation_enrollments'].map(n=>table(core,n)).join('\n')}
${['customer_accounts','payment_checkouts','ghl_events'].map(n=>table(access,n)).join('\n')}
alter table leads add column ghl_contact_id text,add column ghl_location_id text,add column opt_out_at timestamptz,add column last_reply_at timestamptz;
alter table outreach_events add column conversation_id text;
create table customer_contacts(id uuid primary key,ghl_contact_id text,ghl_location_id text);
${fs.readFileSync(path.join(root,'supabase/migrations/20261015_opendots_durable_handoffs.sql'),'utf8')}
${fs.existsSync(next)?fs.readFileSync(next,'utf8'):''}
insert into businesses(id,name) values('00000000-0000-4000-8000-000000000001','Synthetic');
insert into leads(id,business_id,ghl_contact_id,ghl_location_id) values('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','synthetic-contact','synthetic-location');
insert into ghl_events(external_event_id,message_id,ghl_location_id,contact_id,conversation_id,event_type,payload_meta) values('synthetic-anchor','synthetic-anchor','synthetic-location','synthetic-contact','synthetic-conversation','InboundMessage','{"openDots":{"status":"decision_saved","eventId":"synthetic-anchor","dispatched":0,"action":"handoff"}}');`);
const json=s=>{const out=sql(s);return out?JSON.parse(out):null};
const message=(id,body='Equal text',extra={})=>({id,body,contactId:'synthetic-contact',conversationId:'synthetic-conversation',direction:'inbound',messageType:'TYPE_WHATSAPP',dateAdded:'2026-10-15T01:00:00.000Z',...extra});
const claim=()=>json("select claim_controlled_inbox('synthetic-location','synthetic-contact')");
const batch=(lease,messages)=>`select ingest_controlled_inbox_batch('${lease}','${JSON.stringify(messages)}'::jsonb)`;
test('initialization requires an already saved verified anchor and never resets an existing cursor',()=>{
 assert.throws(()=>sql("select initialize_controlled_inbox('synthetic-location','synthetic-contact','synthetic-conversation','unknown')"),/verified_anchor_required/);
 assert.equal(sql("select initialize_controlled_inbox('synthetic-location','synthetic-contact','synthetic-conversation','synthetic-anchor')"),'t');
});
test('cursor lease serializes concurrent notifications and refuses foreign release',()=>{
 const c=claim();assert.ok(c.lease_token);assert.equal(claim(),null);assert.equal(sql("select release_controlled_inbox('00000000-0000-4000-8000-000000000099',null)"),'f');assert.equal(sql(`select release_controlled_inbox('${c.lease_token}',null)`),'t');
});
test('two same-text real IDs and cursor are committed together, with distinct durable jobs',()=>{
 const c=claim();assert.equal(json(batch(c.lease_token,[message('synthetic-A'),message('synthetic-B')])).ingested,2);assert.equal(sql("select cursor_message_id from ghl_controlled_inboxes"),'synthetic-B');assert.equal(sql("select count(*) from ghl_events where message_id in ('synthetic-A','synthetic-B')"),'2');assert.equal(sql("select count(*) from opendots_handoffs where event_id in ('synthetic-A','synthetic-B')"),'2');
});
test('a second-message failure rolls back all writes and the cursor, leaving a resumable lease',()=>{
 const c=claim();sql(`create function inject_inbox_failure() returns trigger language plpgsql as $$begin if new.external_event_id='synthetic-bad' then raise exception 'injected_message_failure';end if;return new;end $$;create trigger injected before insert on ghl_events for each row execute function inject_inbox_failure();`);
 assert.throws(()=>sql(batch(c.lease_token,[message('synthetic-good'),message('synthetic-bad')])),/injected_message_failure/);
 assert.equal(sql("select cursor_message_id from ghl_controlled_inboxes"),'synthetic-B');assert.equal(sql("select count(*) from ghl_events where message_id='synthetic-good'"),'0');assert.equal(sql("select count(*) from opendots_handoffs where event_id='synthetic-good'"),'0');
 sql(`drop trigger injected on ghl_events;drop function inject_inbox_failure();select release_controlled_inbox('${c.lease_token}','injected');`);
});
test('an expired lease cannot commit any message or change the cursor',()=>{
 const c=claim();sql("update ghl_controlled_inboxes set leased_until=now()-interval '1 second'");assert.throws(()=>sql(batch(c.lease_token,[message('synthetic-expired')])),/inbox_lease_expired/);assert.equal(sql("select count(*) from ghl_events where message_id='synthetic-expired'"),'0');const next=claim();assert.notEqual(next.lease_token,c.lease_token);sql(`select release_controlled_inbox('${next.lease_token}',null)`);
});
test('foreign message scope rolls back the batch before any cross-business write',()=>{
 const c=claim();assert.throws(()=>sql(batch(c.lease_token,[message('synthetic-foreign','text',{contactId:'OTHER'})])),/inbox_message_scope_conflict/);assert.equal(sql("select count(*) from ghl_events where message_id='synthetic-foreign'"),'0');sql(`select release_controlled_inbox('${c.lease_token}',null)`);
});
test('outbound messages advance a durable cursor without acquisition writes or model jobs',()=>{
 const c=claim();const before=sql('select count(*) from outreach_events');assert.equal(json(batch(c.lease_token,[message('synthetic-outbound','text',{direction:'outbound'})])).ignored,1);assert.equal(sql('select count(*) from outreach_events'),before);assert.equal(sql("select count(*) from opendots_handoffs where event_id='synthetic-outbound'"),'0');assert.equal(sql('select cursor_message_id from ghl_controlled_inboxes'),'synthetic-outbound');
});
test('cursor table and RPCs are backend-only',()=>{
 for(const role of ['anon','authenticated']){assert.equal(sql(`select has_table_privilege('${role}','public.ghl_controlled_inboxes','SELECT')`),'f');assert.equal(sql(`select has_function_privilege('${role}','public.ingest_controlled_inbox_batch(uuid,jsonb)','EXECUTE')`),'f')}
 assert.equal(sql("select has_function_privilege('service_role','public.ingest_controlled_inbox_batch(uuid,jsonb)','EXECUTE')"),'t');
});
test('STOP is persisted before delivery and suppresses previously queued model work',()=>{
 const c=claim();json(batch(c.lease_token,[message('synthetic-stop','STOP')]));assert.equal(sql('select opt_out_at is not null from leads'),'t');const prior=json("select claim_opendots_handoff('synthetic-A')");assert.equal(prior.state,'completed');assert.equal(prior.receipt.status,'skipped_opt_out');assert.equal(prior.receipt.eventId,'synthetic-A');assert.equal(sql("select count(*) from opendots_handoffs where event_id='synthetic-stop'"),'0');
});
