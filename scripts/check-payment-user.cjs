const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const modulePath=path.resolve(__dirname,'../lib/payments/customer-user.ts');
function fixture({pages=[[]],listError=false,inviteError=false,ambiguousInvite=false,wrongInvite=false,inviteThrows=false}={}){
 const calls=[],module={exports:{}};let invited=false;
 const user={id:'synthetic-user',email:'payer@example.invalid'};
 const admin={auth:{admin:{
  async listUsers({page,perPage}){
   calls.push({kind:'list',page,perPage});
   if(listError)return {error:{message:'private_provider_error'}};
   return {data:{users:ambiguousInvite&&invited?[user]:(pages[page-1]||[])}};
  },
  async inviteUserByEmail(email,options){
   calls.push({kind:'invite',email,options});invited=true;
   if(inviteThrows)throw Error('network_ambiguous');
   return inviteError||ambiguousInvite?{error:{message:'invite_failed'}}:{data:{user:wrongInvite?{...user,email:'different@example.invalid'}:user}};
  }
 }}};
 const code=ts.transpileModule(fs.readFileSync(modulePath,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext('(function(module,exports){'+code+'\n})',{Set,Map,Date})(module,module.exports);
 return {calls,run:()=>module.exports.ensureCustomerUser(admin,' Payer@Example.Invalid ','https://synthetic.invalid/login?reset=1')};
}
test('existing user is linked before any invitation',async()=>{const f=fixture({pages:[[{id:'synthetic-user',email:'payer@example.invalid'}]]});const result=await f.run();assert.equal(result.status,'linked');assert.equal(f.calls.filter(x=>x.kind==='invite').length,0)});
test('existing user beyond the first thousand is linked without invitation',async()=>{const page=Array.from({length:1000},(_,i)=>({id:'synthetic-'+i,email:`other-${i}@example.invalid`}));const f=fixture({pages:[page,[{id:'synthetic-user',email:'payer@example.invalid'}]]});assert.equal((await f.run()).status,'linked');assert.deepEqual(f.calls.map(x=>x.page),[1,2])});
test('failed user lookup never authorizes an invitation',async()=>{const f=fixture({listError:true});await assert.rejects(f.run(),/customer_user_lookup_failed/);assert.equal(f.calls.filter(x=>x.kind==='invite').length,0)});
test('verified absence invites once with normalized email and expected redirect',async()=>{const f=fixture();assert.equal((await f.run()).status,'invited');assert.equal(f.calls.filter(x=>x.kind==='invite').length,1);assert.equal(f.calls[1].email,'payer@example.invalid');assert.equal(f.calls[1].options.redirectTo,'https://synthetic.invalid/login?reset=1')});
test('ambiguous invite resolves a created user rather than sending another invitation',async()=>{const f=fixture({ambiguousInvite:true});assert.equal((await f.run()).status,'linked');assert.equal(f.calls.filter(x=>x.kind==='invite').length,1);assert.equal(f.calls.filter(x=>x.kind==='list').length,2)});
test('failed or thrown invitation without user remains incomplete',async()=>{for(const opts of [{inviteError:true},{inviteThrows:true}]){const f=fixture(opts);await assert.rejects(f.run(),/customer_user_creation_unverified/);assert.equal(f.calls.filter(x=>x.kind==='invite').length,1);assert.equal(f.calls.filter(x=>x.kind==='list').length,2)}});
test('a mismatched invitation response cannot link another person',async()=>{const f=fixture({wrongInvite:true});await assert.rejects(f.run(),/customer_user_creation_unverified/)});
test('repeating provider pages are refused before invitation',async()=>{const page=Array.from({length:1000},(_,i)=>({id:'synthetic-'+i,email:`other-${i}@example.invalid`}));const f=fixture({pages:[page,page]});await assert.rejects(f.run(),/customer_user_pagination_unverified/);assert.equal(f.calls.filter(x=>x.kind==='invite').length,0)});
