const {test}=require('node:test');const assert=require('node:assert/strict');
const {credentialEnvironment}=require('./credential-environment.cjs');
test('explicit credential file overrides inherited credentials without mutating process env',()=>{
 const inherited={OPENAI_API_KEY:'SYNTHETIC_INHERITED',OPENDOTS_ENV_FILE:'/synthetic/worker.env',OTHER:'kept'};
 const selected=credentialEnvironment(inherited,file=>{assert.equal(file,'/synthetic/worker.env');return 'OPENAI_API_KEY="SYNTHETIC_AUTHORIZED"\nCPK_INTELLIGENCE_API_KEY=SYNTHETIC_PROJECT\n'});
 assert.equal(selected.OPENAI_API_KEY,'SYNTHETIC_AUTHORIZED');assert.equal(selected.OTHER,'kept');assert.equal(inherited.OPENAI_API_KEY,'SYNTHETIC_INHERITED');
 assert.deepEqual(credentialEnvironment({OPENAI_API_KEY:'SYNTHETIC_HOST'},()=>{throw Error('unexpected_file_read')}),{OPENAI_API_KEY:'SYNTHETIC_HOST'});
});
