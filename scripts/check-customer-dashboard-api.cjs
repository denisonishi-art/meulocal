// Actual route + installed Supabase SDK. Provider HTTP is isolated; never contacts production.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
function fixture({failure=null,status='active',invalidAuth=false,manyForeign=false,olderLead=false}={}){
 const calls=[],business='synthetic-own-business',foreign='synthetic-foreign-business',user='synthetic-user';
 const leads=Array.from({length:olderLead?25:1},(_,i)=>({id:'own-lead-'+i,business_id:business,email:'own@example.invalid',created_at:String(100-i)}));
 const otherLead={id:'foreign-lead',business_id:foreign,email:'foreign@example.invalid',created_at:'999'};
 const activityLead=olderLead?leads.at(-1):leads[0];
 const foreignEvents=Array.from({length:manyForeign?220:1},(_,i)=>({id:'foreign-'+i,lead_id:otherLead.id,event_type:'sent',status:'active',created_at:String(999-i),started_at:String(999-i)}));
 const tables={customer_accounts:[{id:'own-account',user_id:user,business_id:business,payment_status:status}],businesses:[{id:business,name:'Own'}, {id:foreign,name:'Foreign'}],leads:[...leads,otherLead],automation_enrollments:[...foreignEvents,{id:'own-automation',lead_id:activityLead.id,status:'active',started_at:'001'}],outreach_events:[...foreignEvents,{id:'own-event',lead_id:activityLead.id,event_type:'sent',created_at:'001'}],payment_checkouts:[],google_business_connections:[],ghl_locations:[],customer_contacts:[],review_request_settings:[],review_request_enrollments:[],review_request_events:[],customer_imports:[]};
 const fetcher=async(input,options={})=>{
  const url=new URL(String(input));calls.push({path:url.pathname,query:url.searchParams,method:options.method||'GET'});
  assert.equal(options.method||'GET','GET','dashboard_must_be_read_only');
  if(url.pathname==='/auth/v1/user')return Response.json(invalidAuth?{msg:'invalid_token'}:{id:user,email:'own@example.invalid',aud:'authenticated',role:'authenticated'},{status:invalidAuth?401:200});
  const name=url.pathname.split('/').at(-1);assert.ok(name in tables,'unexpected_table:'+name);
  if(name===failure)return Response.json({message:'private_failure_should_not_expose',code:'synthetic_error'},{status:503});
  let rows=tables[name].map(r=>({...r}));const select=url.searchParams.get('select')||'';
  if(select.includes('leads!inner('))rows=rows.map(row=>({...row,[select.includes('lead:leads!inner(')?'lead':'leads']:tables.leads.find(lead=>lead.id===row.lead_id)}));
  for(const [key,filter] of url.searchParams){if(!filter.startsWith('eq.'))continue;const path=key.split('.'),value=filter.slice(3);rows=rows.filter(row=>path.reduce((r,k)=>r?.[k],row)===value)}
  const order=url.searchParams.get('order');if(order){const [field,direction]=order.split('.');rows.sort((a,b)=>String(a[field]).localeCompare(String(b[field]))*(direction==='desc'?-1:1))}
  if(url.searchParams.has('limit'))rows=rows.slice(0,Number(url.searchParams.get('limit')));
  return Response.json(rows);
 };
 const sdk=require('@supabase/supabase-js');
 const req=name=>{if(name==='next/server')return {NextResponse:{json:(data,options={})=>Response.json(data,options)}};if(name==='@supabase/supabase-js')return {createClient:(url,key,options={})=>sdk.createClient(url,key,{...options,global:{...options.global,fetch:fetcher}})};throw Error('unexpected_import:'+name)};
 const code=ts.transpileModule(fs.readFileSync(path.join(root,'app/api/customer-dashboard/route.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,module={exports:{}};
 vm.runInNewContext('(function(require,module,exports){'+code+'\n})',{process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://synthetic.invalid',NEXT_PUBLIC_SUPABASE_ANON_KEY:'synthetic-anon',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service'}},fetch:fetcher,AbortSignal,Set,Map})(req,module,module.exports);
 return {calls,send:async(token='Bearer synthetic-user-token')=>{const response=await module.exports.GET({headers:{get:()=>token}});return {status:response.status,data:await response.json()}}};
}
test('unauthenticated request never performs privileged data reads',async()=>{const f=fixture();assert.equal((await f.send(null)).status,401);assert.equal(f.calls.length,0);const invalid=fixture({invalidAuth:true});assert.equal((await invalid.send()).status,401);assert.ok(!invalid.calls.some(c=>c.path.startsWith('/rest/')))});
test('pending, canceled and past-due accounts cannot read the operational dashboard',async()=>{for(const status of ['pending','canceled','past_due']){const f=fixture({status});assert.equal((await f.send()).status,403);assert.equal(f.calls.filter(c=>c.path.startsWith('/rest/')).length,1)}});
test('account read failure is unavailable, not a fictional missing account',async()=>{const f=fixture({failure:'customer_accounts'});assert.equal((await f.send()).status,503)});
test('failure in any required data source cannot become successful zero metrics',async()=>{for(const table of ['businesses','leads','automation_enrollments','outreach_events','payment_checkouts','google_business_connections','ghl_locations','customer_contacts','review_request_settings','review_request_enrollments','review_request_events','customer_imports']){const f=fixture({failure:table});const result=await f.send();assert.equal(result.status,503,table);assert.ok(!JSON.stringify(result.data).includes('private_failure'))}});
test('recent foreign activity cannot push the customers own activity out of the dashboard',async()=>{const f=fixture({manyForeign:true});const result=await f.send();assert.equal(result.status,200);assert.equal(result.data.automations.length,1);assert.equal(result.data.requests.length,1);assert.equal(result.data.summary.sent,1);assert.equal(result.data.summary.activeAutomations,1);assert.ok(!JSON.stringify(result.data).includes('foreign@example.invalid'))});
test('activity of an older own lead remains visible beyond the 20-lead display limit',async()=>{const f=fixture({olderLead:true});const result=await f.send();assert.equal(result.status,200);assert.equal(result.data.leads.length,20);assert.equal(result.data.requests.length,1);assert.equal(result.data.requests[0].lead.email,'own@example.invalid');assert.equal(result.data.automations.length,1)});
