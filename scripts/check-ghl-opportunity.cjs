const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript'),vm=require('vm');
function load(file,deps={},globals={}){const m={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext('(function(require,module,exports){'+code+'\n})',{process:{env:{}},URL,Buffer,Date,AbortSignal,console,...globals})(name=>deps[name]||require(name),m,m.exports);return m.exports}

const hl=(responses)=>{const calls=[];const api=load('lib/highlevel-operational.ts',{}, {fetch:async(url,init)=>{calls.push({url:String(url),method:init?.method||'GET',body:init?.body?JSON.parse(init.body):undefined});return responses(calls.length,url)}},URLSearchParams);return {api,calls}};

test('findOperationalOpportunity filters by contact_id and returns the bound id',async()=>{
 const {api,calls}=hl(()=>Response.json({opportunities:[{id:'existing-opp',contactId:'c1'}]}));
 assert.equal(await api.findOperationalOpportunity({token:'t',locationId:'loc',contactId:'c1'}),'existing-opp');
 assert.ok(calls[0].url.includes('/opportunities/search'));
 assert.equal(calls[0].body.filters[0].field,'contact_id');
 assert.equal(calls[0].body.filters[0].value,'c1');
});
test('findOperationalOpportunity returns null when the contact has no opportunity',async()=>{
 const {api}=hl(()=>Response.json({opportunities:[]}));
 assert.equal(await api.findOperationalOpportunity({token:'t',locationId:'loc',contactId:'c1'}),null);
});
test('createOperationalOpportunity returns the existing opportunity without a create call',async()=>{
 const {api,calls}=hl(()=>Response.json({opportunities:[{id:'existing-opp',contactId:'c1'}]}));
 const r=await api.createOperationalOpportunity({token:'t',locationId:'loc',contactId:'c1',name:'n',pipelineId:'p',pipelineStageId:'s'});
 assert.equal(r.id,'existing-opp');
 assert.equal(r.created,false);
 assert.equal(calls.length,1); // search only
});
test('createOperationalOpportunity posts an open opportunity in the configured pipeline when none exists',async()=>{
 const {api,calls}=hl((n,url)=>url.includes('/opportunities/search')?Response.json({opportunities:[]}):Response.json({opportunity:{id:'new-opp'}}));
 const r=await api.createOperationalOpportunity({token:'t',locationId:'loc',contactId:'c1',name:'Empresa X',pipelineId:'p',pipelineStageId:'s'});
 assert.equal(r.id,'new-opp');
 assert.equal(r.created,true);
 assert.equal(calls.length,2);
 const create=calls[1];
 assert.equal(create.method,'POST');
 assert.ok(create.url.includes('/opportunities/'));
 assert.equal(create.body.status,'open');
 assert.equal(create.body.contactId,'c1');
 assert.equal(create.body.pipelineId,'p');
 assert.equal(create.body.pipelineStageId,'s');
 assert.equal(create.body.name,'Empresa X');
});
test('defaults point to the reused Vendas MeuLocal pipeline and Novo lead stage',()=>{
 const api=load('lib/ghl-opportunity.ts',{'@/lib/highlevel-operational':{}},{process:{env:{}}});
 const c=api.operationalOpportunityConfig();
 assert.equal(c.pipelineId,'GeQnDT0zT4wQfojd7VFo');
 assert.equal(c.pipelineStageId,'aeef9f4e-894d-4ea9-80b7-22b442fbfce5');
});
test('syncOperationalOpportunity is inert when the flag is not enabled',async()=>{
 const api=load('lib/ghl-opportunity.ts',{'@/lib/highlevel-operational':{getLocationAccessToken:async()=>{throw Error('unexpected')},createOperationalOpportunity:async()=>{throw Error('unexpected')}}},{process:{env:{GHL_OPPORTUNITY_SYNC_ENABLED:'false'}}});
 const r=await api.syncOperationalOpportunity({locationId:'loc',contactId:'c1',name:'n'});
 assert.equal(r.skipped,true);
 assert.equal(r.reason,'opportunity_sync_disabled');
});
test('syncOperationalOpportunity links the contact when enabled and reports creation',async()=>{
 let created=null;
 const api=load('lib/ghl-opportunity.ts',{'@/lib/highlevel-operational':{getLocationAccessToken:async()=> 'synthetic-token',createOperationalOpportunity:async(a)=>{created=a;return {id:'opp-1',created:true}}}},{process:{env:{GHL_OPPORTUNITY_SYNC_ENABLED:'true',GHL_PIPELINE_ID:'pipe-env',GHL_PIPELINE_STAGE_ID:'stage-env'}}});
 const r=await api.syncOperationalOpportunity({locationId:'loc',contactId:'c1',name:'n'});
 assert.equal(r.skipped,false);
 assert.equal(r.opportunityId,'opp-1');
 assert.equal(r.created,true);
 assert.equal(created.pipelineId,'pipe-env');
 assert.equal(created.pipelineStageId,'stage-env');
});
test('syncOperationalOpportunity never throws on provider failure',async()=>{
 const api=load('lib/ghl-opportunity.ts',{'@/lib/highlevel-operational':{getLocationAccessToken:async()=> 'synthetic-token',createOperationalOpportunity:async()=>{throw Error('highlevel_http_401')}}},{process:{env:{GHL_OPPORTUNITY_SYNC_ENABLED:'true'}}});
 const r=await api.syncOperationalOpportunity({locationId:'loc',contactId:'c1',name:'n'});
 assert.equal(r.skipped,false);
 assert.ok(r.error);
});
