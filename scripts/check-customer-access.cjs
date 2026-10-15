const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const base=fs.readFileSync(path.join(__dirname,'check-payment-database.cjs'),'utf8').split('const id=n=>')[0];
const {sql}=new Function('require','__dirname','process',base+'\nreturn {sql};')(require,__dirname,process);
sql('alter table auth.users add column email_confirmed_at timestamptz');
const migration=path.join(root,'supabase/migrations/20261015_006_customer_access_claim.sql');if(fs.existsSync(migration))sql(fs.readFileSync(migration,'utf8'));
const q=value=>value==null?'null':"'"+String(value).replaceAll("'","''")+"'";
const json=source=>JSON.parse(sql(source));
function fixture({confirmed=true,status='active',otherBusiness=false,otherUser=false,leadEmail=null}={}){
 const user=crypto.randomUUID(),business=crypto.randomUUID(),account=crypto.randomUUID(),lead=crypto.randomUUID(),foreign=crypto.randomUUID();
 const email='payer-'+user+'@example.invalid';
 sql(`insert into businesses(id,name) values(${q(business)},'Synthetic access');insert into auth.users(id,email,email_confirmed_at) values(${q(user)},${q(email)},${confirmed?'now()':'null'});insert into leads(id,business_id,email) values(${q(lead)},${q(business)},${q(leadEmail||email)});insert into customer_accounts(id,business_id,payment_status) values(${q(account)},${q(business)},${q(status)})`);
 if(otherBusiness){sql(`insert into businesses(id,name) values(${q(foreign)},'Foreign');insert into leads(business_id,email) values(${q(foreign)},${q(email)})`)}
 if(otherUser){sql(`insert into auth.users(id,email) values(${q(foreign)},'foreign@example.invalid');update customer_accounts set user_id=${q(foreign)} where id=${q(account)}`)}
 return {user,business,account,email,foreign};
}
function route(f,{lookupError=false,databaseError=false}={}){
 let privileged=0;const db={rpc:async(name,args)=>{privileged++;assert.equal(name,'claim_customer_access');assert.equal(args.p_user_id,f.user);if(databaseError)return {error:{message:'synthetic_db_unavailable'}};try{return {data:json(`select claim_customer_access(${q(args.p_user_id)})`)}}catch(error){return {error:{message:error.message}}}},from(){throw Error('unexpected_nonatomic_account_lookup')}};
 const auth={auth:{async getUser(){
  if(lookupError)return {data:{user:null},error:{message:'invalid_token'}};
  return {data:{user:{id:f.user,email:f.email,email_confirmed_at:sql(`select coalesce(email_confirmed_at::text,'') from auth.users where id=${q(f.user)}`)}}};
 }}};
 const req=name=>name==='next/server'?{NextResponse:{json:(data,options={})=>({data,status:options.status||200})}}:name==='@supabase/supabase-js'?{createClient:(_url,key)=>key==='synthetic-anon'?auth:db}:null;
 const code=ts.transpileModule(fs.readFileSync(path.join(root,'app/api/customer-access/claim/route.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,module={exports:{}};
 vm.runInNewContext('(function(require,module,exports){'+code+'\n})',{process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://synthetic.invalid',NEXT_PUBLIC_SUPABASE_ANON_KEY:'synthetic-anon',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service'}},AbortSignal})(req,module,module.exports);
 return {send:(token='Bearer synthetic-token')=>module.exports.POST({headers:{get:()=>token}}),privileged:()=>privileged};
}
test('verified payer links only the paid business and repeated claims reuse the same account',async()=>{const f=fixture(),api=route(f),first=await api.send();assert.equal(first.status,200);assert.equal(first.data.businessId,f.business);assert.equal(sql(`select user_id from customer_accounts where id=${q(f.account)}`),f.user);assert.equal((await api.send()).status,200)});
test('missing or rejected Auth token never invokes the privileged claim',async()=>{const f=fixture(),api=route(f);assert.equal((await api.send(null)).status,401);assert.equal(api.privileged(),0);const invalid=route(f,{lookupError:true});assert.equal((await invalid.send()).status,401);assert.equal(invalid.privileged(),0)});
test('unconfirmed email cannot claim a paid account',async()=>{const f=fixture({confirmed:false}),api=route(f);assert.equal((await api.send()).status,401);assert.equal(sql(`select user_id is null from customer_accounts where id=${q(f.account)}`),'t')});
test('pending, canceled and past-due accounts cannot grant a login binding',async()=>{for(const status of ['pending','canceled','past_due']){const f=fixture({status}),api=route(f);assert.equal((await api.send()).status,409);assert.equal(sql(`select user_id is null from customer_accounts where id=${q(f.account)}`),'t')}});
test('email normalization permits an exact case-insensitive payer match',async()=>{const f=fixture();sql(`update leads set email=upper(email) where business_id=${q(f.business)}`);assert.equal((await route(f).send()).status,200)});
test('two businesses with the same payer email require human resolution',async()=>{const f=fixture({otherBusiness:true});assert.equal((await route(f).send()).status,404);assert.equal(sql(`select user_id is null from customer_accounts where id=${q(f.account)}`),'t')});
test('multiple leads for the same business do not make an otherwise unique binding ambiguous',async()=>{const f=fixture();sql(`insert into leads(business_id,email) values(${q(f.business)},${q(f.email)}),(${q(f.business)},${q(f.email)})`);assert.equal((await route(f).send()).status,200)});
test('an account already linked to someone else cannot be taken over',async()=>{const f=fixture({otherUser:true});assert.equal((await route(f).send()).status,409);assert.equal(sql(`select user_id from customer_accounts where id=${q(f.account)}`),f.foreign)});
test('backend rechecks Auth confirmation even if caller has a trusted user ID',()=>{const f=fixture({confirmed:false});assert.equal(json(`select claim_customer_access(${q(f.user)})`).state,'unauthorized')});
test('a database failure returns unavailable, never a fabricated missing activation',async()=>{const f=fixture(),api=route(f,{databaseError:true});assert.equal((await api.send()).status,503);assert.equal(sql(`select user_id is null from customer_accounts where id=${q(f.account)}`),'t')});
test('concurrent login claims converge on one account binding',async()=>{const f=fixture(),api=route(f);const results=await Promise.all([api.send(),api.send()]);assert.deepEqual(results.map(r=>r.status),[200,200]);assert.equal(sql(`select count(*) from customer_accounts where user_id=${q(f.user)}`),'1')});
test('browser roles cannot call privileged access claiming RPC',()=>{for(const role of ['anon','authenticated'])assert.equal(sql(`select has_function_privilege('${role}','claim_customer_access(uuid)','EXECUTE')`),'f')});
