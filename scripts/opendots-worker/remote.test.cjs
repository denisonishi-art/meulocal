const {test}=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');
const {createResearchWorker}=require('./adapter.cjs');
const sharedRoot=path.join(process.env.OPENDOTS_ROOT||path.resolve('.opendots/upstream'),'meulocal-adapter/shared');
test('allows only explicitly approved MeuLocal HTTPS qualification; loopback guards remain',()=>{
 const settings={repoRoot:path.resolve('.'),sharedRoot,apiKey:'SYNTHETIC_KEY',endpoint:'https://meulocal.ia.br/api/agents/prospecting',approvedRemoteOrigin:'https://meulocal.ia.br'};
 assert.equal(typeof createResearchWorker(settings).research,'function');
 for(const endpoint of ['https://evil.example/api/agents/prospecting','http://meulocal.ia.br/api/agents/prospecting','https://meulocal.ia.br:444/api/agents/prospecting','https://key@meulocal.ia.br/api/agents/prospecting','https://meulocal.ia.br/api/agents/prospect/approve'])assert.throws(()=>createResearchWorker({...settings,endpoint}));
 assert.throws(()=>createResearchWorker({...settings,approvedRemoteOrigin:undefined}),/loopback/);
});
test('portable configuration reads process env, rejects missing auth and prevents remote writes',()=>{
 const {configuration}=require('./remote-config.cjs');
 const env={OPENDOTS_ROOT:'/workspace/upstream',MEULOCAL_PROSPECTOR_API_KEY:'SYNTHETIC_KEY',CPK_INTELLIGENCE_API_KEY:'SYNTHETIC_INTELLIGENCE',OPENAI_API_KEY:'SYNTHETIC_MODEL'};
 const config=configuration(env,'/workspace/meulocal');assert.equal(config.model,'gpt-4.1-mini-2025-04-14');assert.equal(config.limit,5);assert.equal(config.mode,'intelligence');assert.equal(config.endpoint,'https://meulocal.ia.br/api/agents/prospecting');assert.equal(config.outputDir,'/workspace/meulocal/.opendots/results');
 assert.throws(()=>configuration({...env,OPENAI_API_KEY:''},'/workspace/meulocal'),/OPENAI_API_KEY/);
 assert.throws(()=>configuration({...env,MEULOCAL_RESEARCH_LIMIT:'21'},'/workspace/meulocal'),/limit/);
 assert.throws(()=>configuration({...env,OPENDOTS_EXECUTION_MODE:'fallback'},'/workspace/meulocal'),/mode/);
 assert.throws(()=>configuration({...env,MEULOCAL_PROSPECTOR_ENDPOINT:'https://evil.example/api/agents/prospecting'},'/workspace/meulocal'),/endpoint/);
});
