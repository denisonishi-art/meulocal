const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');

function loadTS(file,deps={}){
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  reportDiagnostics:true
 });
 assert.equal(js.diagnostics.filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
 const mod={exports:{}};
 new Function('require','module','exports',js.outputText)(name=>deps[name]||require(name),mod,mod.exports);
 return mod.exports;
}
const official=loadTS('lib/acquisition/official-email-source.ts');
const attribution=loadTS('lib/acquisition/recipient-attribution.ts');
const id='ChIJWashingtonVMariana1234';
const source='https://academiawashington.com.br/unidades_/escola-de-ingles-2/';
const recipient='vila.mariana@academiawashington.com.br';
const site='https://www.academiawashington.com.br';
const details={
 id,displayName:{text:'Academia de Inglês Washington de Vila Mariana'},
 formattedAddress:'R. Domingos de Morais, 239 - Vila Mariana, São Paulo',
 websiteUri:site,businessStatus:'OPERATIONAL'
};
const base={placeId:'places/'+id,email:recipient,sourceUrl:source};
const relevantEnv=['GOOGLE_PLACES_API_KEY','NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
const saved=Object.fromEntries(relevantEnv.map(k=>[k,process.env[k]]));
test.before(()=>{
 process.env.GOOGLE_PLACES_API_KEY='synthetic-places-key';
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://synthetic.supabase.invalid';
 process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-service-role';
});
test.after(()=>{for(const [key,v] of Object.entries(saved)){if(v===undefined)delete process.env[key];else process.env[key]=v}});

function setup({authorized=true,google=details,readiness=true}={}){
 const calls={google:[],local:0,db:0};
 const deps={
  'next/server':{NextResponse:{json:(body,opts={})=>Response.json(body,opts)}},
  '@supabase/supabase-js':{createClient:()=>{calls.db++;return {}} },
  '@/lib/admin-auth':{isAdminRequest:async()=>authorized},
  '@/lib/acquisition/recipient-attribution':attribution,
  '@/lib/acquisition/official-email-source':official,
  '@/lib/acquisition/manual-prospect':{manualRecipientReadiness:async(_db,target)=>{
   calls.local++;
   assert.equal(target.website,site);
   assert.equal(target.id,id);
   assert.equal(target.recipient,recipient);
   return readiness?{canSend:true,sendToken:'signed-verification-only-token'}:{canSend:false,sendToken:null,reason:'Bloqueado por DND ou opt-out.'};
  }}
 };
 const handler=loadTS('app/api/agents/prospect/manual-email/route.ts',deps);
 const post=async(payload=base)=>{
  const prev=global.fetch;
  global.fetch=async(url,opts)=>{
   calls.google.push({url,opts});
   return Response.json(google);
  };
  try{return await handler.POST(new Request('https://synthetic.invalid/api/agents/prospect/manual-email',{
   method:'POST',body:JSON.stringify(payload)
  }))}
  finally{global.fetch=prev}
 };
 return {post,calls};
}
test('only official-site URLs with identical host can be used, never arbitrary source or localhost',()=>{
 assert.equal(official.officialSourceMatches(source,site),true);
 for(const suspect of [
  'https://academiawashington.com.br.evil.example/unidades/',
  'https://evil.example/?site=academiawashington.com.br',
  'http://academiawashington.com.br/unidades/',
  'https://academiawashington.com.br:444/unidades/',
  'https://academiawashington.com.br@evil.example/unidades/',
  'https://academiawashington.com.br.evil.example/',
  'https://localhost:8443/'
 ])assert.equal(official.officialSourceMatches(suspect,site),false,suspect);
});
test('valid Washington site e-mail yields only an unpaid verifier token, no send credential',async()=>{
 const f=setup();const response=await f.post();const result=await response.json();
 assert.equal(response.status,200);
 assert.equal(result.status,'awaiting_mailbox_verification');
 assert.equal(result.emailVerifyToken,'signed-verification-only-token');
 assert.equal(result.canSend,false);
 assert.equal(result.chargeInitiated,false);
 assert.equal(result.dispatched,0);
 assert.equal(result.recipient,recipient);
 assert.equal(f.calls.google.length,1);
 assert.match(f.calls.google[0].url,/places\.googleapis\.com/);
 assert.equal(f.calls.google[0].opts.headers['X-Goog-FieldMask'].includes('websiteUri'),true);
 assert.equal(f.calls.local,1);
 assert.equal(f.calls.db,1);
});
test('unauthenticated user cannot even request Google Places details',async()=>{
 const f=setup({authorized:false});const response=await f.post();
 assert.equal(response.status,401);
 assert.equal(f.calls.google.length,0);
 assert.equal(f.calls.db,0);
});
test('missing or forged official source / unrelated address remains blocked before any paid or GHL call',async()=>{
 const invalid=[
  {...base,sourceUrl:'https://scam.example/unidade'},
  {...base,email:'joao@email.com'},
  {...base,email:'central@gmail.com'},
  {...base,sourceUrl:'http://academiawashington.com.br/'},
 ];
 for(const payload of invalid){
  const f=setup();const response=await f.post(payload);
  assert.equal(response.status,422,JSON.stringify(payload));
  assert.equal(f.calls.db,0);
  assert.equal(f.calls.local,0);
 }
});
test('DND/opt-out blocks even a verified source email and never grants a mailbox token',async()=>{
 const f=setup({readiness:false});
 const response=await f.post();
 const body=await response.json();
 assert.equal(response.status,409);
 assert.equal(body.canSend,false);
 assert.equal(body.emailVerifyToken,null);
 assert.equal(f.calls.local,1);
});
test('Google profile website missing or business identity mismatched fails closed',async()=>{
 for(const data of [{...details,websiteUri:null},{...details,id:'ChIJOther'}, {...details,businessStatus:'CLOSED_PERMANENTLY'}]){
  const f=setup({google:data});const response=await f.post();
  assert.equal(response.status,422);
  assert.equal(f.calls.local,0);
 }
});
test('frontend requires a source URL before verification and preserves manual send confirmation',()=>{
 const ui=fs.readFileSync('app/admin/AdminClient.tsx','utf8');
 const paid=fs.readFileSync('app/api/agents/prospect/verify-email/route.ts','utf8');
 const sending=fs.readFileSync('app/api/agents/prospect/send-manual/route.ts','utf8');
 assert.match(ui,/Conferir e-mail oficial \(sem enviar\)/);
 assert.match(ui,/async function checkOfficialEmail/);
 assert.match(ui,/manualEmails\[p\.id\]\?\.sourceUrl/);
 assert.match(ui,/\/api\/agents\/prospect\/manual-email/);
 assert.match(ui,/Validar caixa de e-mail no HighLevel \(sem enviar\)/);
 assert.match(ui,/window\.confirm\('Verificar a caixa postal/);
 assert.match(ui,/window\.confirm\('Enviar UMA mensagem/);
 assert.match(paid,/confirmed:z\.literal\(true\)/);
 assert.match(sending,/mailboxVerifiedAt/);
 const route=fs.readFileSync('app/api/agents/prospect/manual-email/route.ts','utf8');
 assert.doesNotMatch(route,/deliverAcquisitionMessage|syncOperationalOpportunity|\/contacts\/|\/email\/verify/);
});
