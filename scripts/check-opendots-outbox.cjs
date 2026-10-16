const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const base=fs.readFileSync(path.join(__dirname,'check-payment-database.cjs'),'utf8').split('const id=n=>')[0];
const {sql}=new Function('require','__dirname','process',base+'\nreturn {sql};')(require,__dirname,process);
const q=value=>value==null?'null':"'"+String(value).replaceAll("'","''")+"'";
const json=source=>JSON.parse(sql(source));
const business=crypto.randomUUID();sql(`insert into businesses(id,name) values(${q(business)},'Synthetic outbox')`);
function add(id,created,available){const payload={eventId:id,kind:'meulocal.customer.lifecycle',version:1,permissions:{initialSend:false,autoReply:false,crmWrite:false}};sql(`insert into opendots_handoffs(event_id,business_id,kind,payload,created_at,available_at) values(${q(id)},${q(business)},'meulocal.customer.lifecycle',${q(JSON.stringify(payload))}::jsonb,now()+interval '${created}',now()+interval '${available}')`)}
function load({throwOn=null,guidance=null}={}){
 const db={from(name){assert.equal(name,'opendots_handoffs');const filters=[],orders=[];let limit;
  const query={select(){return query},in(key,values){assert.equal(key,'state');filters.push('state in ('+values.map(q).join(',')+')');return query},lte(key,value){assert.equal(key,'available_at');filters.push(key+'<='+q(value));return query},order(key){assert.ok(['created_at','available_at'].includes(key));orders.push(key);return query},limit(n){limit=n;return query},then(resolve,reject){return Promise.resolve({data:json("select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from (select event_id from opendots_handoffs where "+filters.join(' and ')+' order by '+orders.join(',')+' limit '+limit+') t')}).then(resolve,reject)}};return query;
 },rpc:async(name,args)=>{if(name==='claim_opendots_handoff'&&args.p_event_id===throwOn)throw Error('synthetic_database_rejection');assert.ok(['claim_opendots_handoff','settle_opendots_handoff'].includes(name));const values=Object.entries(args).map(([key,value])=>key+'=>'+(typeof value==='object'?q(JSON.stringify(value))+'::jsonb':q(value)));return {data:json('select to_jsonb('+name+'('+values.join(',')+'))')}}};
 const module={exports:{}};
 const req=name=>name==='../highlevel-operational'?{getLocationAccessToken:()=>{throw Error('no_contact_access')},removeOperationalTags:()=>{throw Error('no_contact_write')}}:{deliverOpenDotsEvent:async input=>input.eventId.includes('fail')?{status:'unavailable'}:{status:'decision_saved',eventId:input.eventId,dispatched:0,action:'handoff',...(guidance?{guidance}:{})}};
 const code=ts.transpileModule(fs.readFileSync(path.join(root,'lib/agents/opendots-outbox.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext('(function(require,module,exports){'+code+'\n})',{Date})(req,module,module.exports);
 return ()=>module.exports.drainOpenDotsOutbox(db);
}
test.beforeEach(()=>sql('delete from opendots_handoffs'));
test('persistent old failures cannot starve a later job whose retry has waited longer',async()=>{add('old-fail-1','-3 hours','-1 minute');add('old-fail-2','-2 hours','-1 minute');add('new-ready','-1 hour','-10 minutes');const result=await load()();assert.equal(sql("select state from opendots_handoffs where event_id='new-ready'"),'completed');assert.equal(result.completed,1);assert.equal(result.pending,1)});
test('one rejected delivery does not prevent processing the next saved job',async()=>{add('first-error','-2 hours','-2 minutes');add('second-ready','-1 hour','-1 minute');const result=await load({throwOn:'first-error'})();assert.equal(result.pending,1);assert.equal(result.completed,1);assert.equal(sql("select state from opendots_handoffs where event_id='second-ready'"),'completed')});

test('settled handoff retains the same saved human guidance for the read-only admin',async()=>{
 add('guided-paid','-1 hour','-1 minute');const guidance={message:'Conferir onboarding.',rationale:'Revisão humana pendente.',nextPath:'/onboarding',requiresHumanReview:true};
 const result=await load({guidance})();assert.equal(result.completed,1);
 const stored=json("select receipt from opendots_handoffs where event_id='guided-paid'");assert.deepEqual(stored.guidance,guidance);assert.equal(stored.dispatched,0);assert.equal(sql("select state from opendots_handoffs where event_id='guided-paid'"),'completed');
});
