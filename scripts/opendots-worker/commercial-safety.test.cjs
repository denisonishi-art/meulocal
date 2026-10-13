const {test}=require('node:test');const assert=require('node:assert/strict');const loader=require('./test-loader.cjs');
test('initial commercial release cannot be enabled by an environment flag or arbitrary body',async()=>{
 process.env.MEULOCAL_PROSPECT_INITIAL_OUTREACH_ENABLED='true';let calls=0;
 const {POST}=loader({'@/lib/admin-auth':{isAdminRequest:async()=>true},'@supabase/supabase-js':{createClient:()=>{calls++;throw Error('must_not_write')}},'@/lib/ghl-prospecting':{enqueueGhlProspect:()=>{calls++;throw Error('must_not_contact')},findBusinessEmail:()=>{calls++;throw Error('must_not_research')},sendGhlProspectWhatsApp:()=>{calls++;throw Error('must_not_send')}}})('app/api/agents/prospect/approve/route.ts');
 const res=await POST(new Request('https://synthetic.invalid',{method:'POST',body:JSON.stringify({prospects:[{id:'SYNTHETIC',name:'SYNTHETIC'}],approved:true})}));assert.equal(res.status,423);assert.equal(calls,0);
});
test('legacy GHL enqueue never upserts or adds a trigger tag while the release is unproven',async()=>{
 const {enqueueGhlProspect}=loader()('lib/ghl-prospecting.ts');process.env.GHL_API_KEY='SYNTHETIC';let calls=0;const previous=global.fetch;global.fetch=()=>{calls++;throw Error('must_not_write')};try{const r=await enqueueGhlProspect({businessName:'SYNTHETIC',email:'synthetic@example.invalid',diagnosticUrl:'https://synthetic.invalid'});assert.equal(r.ok,false);assert.match(r.reason,/release_not_verified/);assert.equal(calls,0)}finally{global.fetch=previous}
});
