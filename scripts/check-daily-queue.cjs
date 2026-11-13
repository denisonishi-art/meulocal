const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript'),vm=require('vm');
function load(file,deps={},env={}){const m={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext('(function(require,module,exports){'+code+'\n})',{process:{env},URL,Buffer,Date,Intl,AbortSignal,console,Error,Promise,Set,Map,Array,String,Number,Boolean,JSON,Math,fetch:undefined,crypto:globalThis.crypto,TextEncoder,Uint8Array})(name=>deps[name]||(name==='./daily-queue'?queue:require(name)),m,m.exports);return m.exports}
const queue=load('lib/acquisition/daily-queue.ts',{'@/lib/admin-auth':{adminSessionToken:async()=>'t'}},{ADMIN_ACCESS_KEY:'k'});
const runner=load('lib/acquisition/daily-queue-runner.ts');
const msg='Olá! Esta é uma mensagem sintética de teste com mais de cinquenta caracteres para o rascunho.';
function fakeDb({claim={claimed:true,status:'processing',searched:false},seen=[],perms=[]}={}){
 const state={rows:[],run:{},rpcs:[]};let n=0;
 const tbl=name=>{
  const q={filters:[],orders:[],lim:null,op:'select',patch:null};
  const api={
   select(){q.op='select';return api},eq(k,v){q.filters.push([k,v]);return api},
   order(k,o){q.orders.push([k,o]);return api},limit(x){q.lim=x;return api},
   insert(r){q.op='insert';if(name==='prospect_daily_queue'){for(const x of r)state.rows.push({id:'id'+(++n),status:'candidate',...x})}return Promise.resolve({error:null})},
   update(p){q.op='update';q.patch=p;return api},delete(){q.op='delete';return api},
   then(res,rej){return Promise.resolve(exec()).then(res,rej)}
  };
  function exec(){
   if(name==='prospect_daily_runs'){if(q.op==='update')Object.assign(state.run,q.patch);return {data:null,error:null}}
   if(name==='manual_prospect_permissions')return {data:perms.map(place_id=>({place_id})),error:null};
   const match=r=>q.filters.every(([k,v])=>r[k]===v);
   if(q.op==='update'){state.rows.filter(match).forEach(r=>Object.assign(r,q.patch));return {error:null}}
   if(q.op==='delete'){state.rows=state.rows.filter(r=>!match(r));return {error:null}}
   let out=state.rows.filter(match);
   if(!q.filters.length&&name==='prospect_daily_queue'){out=[...state.rows,...seen.map(place_id=>({place_id}))]}
   for(const [k] of [...q.orders].reverse())out=[...out].sort((a,b)=>(a[k]===null||a[k]===undefined)-(b[k]===null||b[k]===undefined)||(a[k]>b[k]?1:a[k]<b[k]?-1:0));
   return {data:q.lim?out.slice(0,q.lim):out,error:null};
  }
  return api;
 };
 return {state,db:{from:tbl,rpc:async(name,args)=>{state.rpcs.push({name,args});return {data:claim,error:null}}}};
}
const cand=(i,score,website='https://site'+i+'.example.invalid')=>({id:'places/P'+i,name:'Empresa '+i,address:'Rua '+i,rating:4.2,reviews:10+i,website,phone:null,score});
function caller({candidates,noEmail=[],badMailbox=[]}){
 const calls=[];
 const fn=async(path,body)=>{
  calls.push({path,body});
  if(path.endsWith('/search'))return {ok:true,status:200,json:{candidates}};
  if(path.endsWith('/contact-check'))return {ok:true,status:200,json:{results:body.companies.map(c=>noEmail.includes(c.id)?{id:c.id,name:c.name,channel:'blocked',reason:'sem e-mail'}:{id:c.id,name:c.name,channel:'email',recipient:c.id.toLowerCase()+'@empresa.example.invalid',emailVerifyToken:'tok-'+c.id})}};
  if(path.endsWith('/verify-email')){const bad=badMailbox.some(id=>body.emailVerifyToken==='tok-'+id);return {ok:true,status:200,json:bad?{canSend:false,reason:'caixa inexistente'}:{canSend:true,sendToken:'send',reason:'ok'}}}
  if(path.endsWith('/draft'))return {ok:true,status:200,json:{drafts:body.companies.map(c=>({id:c.id,name:c.name,message:msg,rationale:'r'}))}};
  throw Error('unexpected path '+path);
 };
 return {calls,fn};
}
test('day and niche rotation use Sao Paulo time and cycle through the three niches',()=>{
 assert.equal(queue.queueDate(new Date('2026-11-13T02:00:00Z')),'2026-11-12');
 assert.equal(queue.queueDate(new Date('2026-11-13T12:00:00Z')),'2026-11-13');
 const seen=new Set(['2026-11-09','2026-11-10','2026-11-11'].map(d=>queue.nicheForDate(d)));assert.equal(seen.size,3);
});
test('fresh candidates require a website, skip seen ids and keep the priority order',()=>{
 const out=queue.pickFreshCandidates([cand(1,10),cand(2,20,null),cand(3,30),{...cand(1,10)},cand(4,40)],new Set(['P3']),10);
 assert.equal(JSON.stringify(out.map(c=>c.id)),JSON.stringify(['places/P1','places/P4']));
});
test('only 10 verified companies are produced, in closing-chance order, with leftovers discarded',async()=>{
 const candidates=Array.from({length:20},(_,i)=>cand(i+1,i===0?null:100-i)); // menor score = maior chance
 const f=fakeDb(),c=caller({candidates});
 const r=await runner.runDailyQueue({db:f.db,call:c.fn,now:new Date('2026-11-13T12:00:00Z')});
 assert.equal(r.status,'ready');assert.equal(r.ready,10);
 assert.equal(c.calls.filter(x=>x.path.endsWith('/verify-email')).length,10);
 assert.deepEqual([...new Set(c.calls.map(x=>x.path))].sort(),['/api/agents/prospect/contact-check','/api/agents/prospect/draft','/api/agents/prospect/search','/api/agents/prospect/verify-email']);
 const ready=f.state.rows.filter(x=>x.status==='ready');assert.equal(ready.length,10);
 assert.equal(ready.every(x=>x.message===msg&&x.email),true);
 assert.equal(f.state.rows.some(x=>x.status==='candidate'),false);
 const scores=ready.map(x=>x.score);assert.equal(Math.min(...scores),scores.reduce((a,b)=>Math.min(a,b)));
 // a empresa sem score (dados insuficientes) só entra depois das de score numérico
 assert.equal(ready.some(x=>x.place_id==='P1'),false);
});
test('companies without an attributable email or with a bad mailbox are blocked and never charged or drafted',async()=>{
 const candidates=Array.from({length:12},(_,i)=>cand(i+1,50+i));
 const f=fakeDb(),c=caller({candidates,noEmail:['P1','P2'],badMailbox:['P3']});
 const r=await runner.runDailyQueue({db:f.db,call:c.fn,now:new Date('2026-11-13T12:00:00Z')});
 assert.equal(r.ready,9);assert.equal(r.status,'ready');
 const by=id=>f.state.rows.find(x=>x.place_id===id);
 assert.equal(by('P1').status,'blocked');assert.equal(by('P2').status,'blocked');assert.equal(by('P3').status,'blocked');
 assert.equal(c.calls.filter(x=>x.path.endsWith('/verify-email')).length,10); // P3 e os 9 válidos; P1/P2 sem consulta paga
 assert.equal(c.calls.some(x=>/send/.test(x.path.replace('verify-email',''))),false);
});
test('no fresh candidates ends the day as empty without charging anything',async()=>{
 const f=fakeDb({seen:['P1','P2']}),c=caller({candidates:[cand(1,10),cand(2,20)]});
 const r=await runner.runDailyQueue({db:f.db,call:c.fn,now:new Date('2026-11-13T12:00:00Z')});
 assert.equal(r.status,'empty');assert.equal(c.calls.filter(x=>x.path.endsWith('/verify-email')).length,0);
});
test('a run that is already finished or busy does nothing',async()=>{
 for(const claim of [{claimed:false,status:'ready'},{claimed:false,status:'busy'}]){
  const f=fakeDb({claim}),c=caller({candidates:[cand(1,10)]});
  const r=await runner.runDailyQueue({db:f.db,call:c.fn});assert.equal(r.claimed,false);assert.equal(c.calls.length,0);
 }
});
test('a failed search releases the lease with a safe error code so the next run can retry',async()=>{
 const f=fakeDb();const r=await runner.runDailyQueue({db:f.db,call:async()=>({ok:false,status:500,json:null}),now:new Date('2026-11-13T12:00:00Z')});
 assert.equal(r.status,'failed');assert.equal(f.state.run.status,'failed');assert.equal(f.state.run.lease_until,null);
});
test('cron route requires the secret and stays off unless explicitly enabled',async()=>{
 const make=env=>load('app/api/cron/daily-prospect-queue/route.ts',{'next/server':{NextResponse:{json:(b,o)=>Response.json(b,o)}},'@supabase/supabase-js':{createClient:()=>({})},'@/lib/acquisition/daily-queue':{appCaller:async()=>async()=>({})},'@/lib/acquisition/daily-queue-runner':{runDailyQueue:async()=>({status:'ready'})}},env);
 const req=h=>new Request('https://x.example.invalid/api/cron/daily-prospect-queue',{headers:h});
 assert.equal((await make({CRON_SECRET:'s'}).GET(req({}))).status,401);
 const off=await make({CRON_SECRET:'s'}).GET(req({authorization:'Bearer s'}));assert.equal((await off.json()).status,'daily_queue_disabled');
 const on=await make({CRON_SECRET:'s',MEULOCAL_DAILY_QUEUE_ENABLED:'true',NEXT_PUBLIC_SUPABASE_URL:'https://db.example.invalid',SUPABASE_SERVICE_ROLE_KEY:'k'}).GET(req({authorization:'Bearer s'}));assert.equal((await on.json()).status,'ready');
});
