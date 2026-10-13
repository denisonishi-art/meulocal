'use strict';
const path=require('node:path');
function configuration(env,repoRoot){
 for(const key of ['OPENAI_API_KEY','CPK_INTELLIGENCE_API_KEY','MEULOCAL_PROSPECTOR_API_KEY'])if(!env[key]?.trim())throw Error('missing_'+key);
 const endpoint=env.MEULOCAL_PROSPECTOR_ENDPOINT||'https://meulocal.ia.br/api/agents/prospecting';
 const url=new URL(endpoint);if(url.href!=='https://meulocal.ia.br/api/agents/prospecting')throw Error('endpoint_not_authorized');
 const mode=env.OPENDOTS_EXECUTION_MODE||'intelligence';if(!['intelligence','local_diagnostic'].includes(mode))throw Error('mode_invalid');
 const limit=Number(env.MEULOCAL_RESEARCH_LIMIT||5);if(!Number.isInteger(limit)||limit<1||limit>20)throw Error('limit_invalid');
 const model=env.OPENAI_MODEL||'gpt-4.1-mini-2025-04-14';if(model!=='gpt-4.1-mini-2025-04-14')throw Error('model_not_reviewed');
 return {repoRoot:path.resolve(repoRoot),official:path.resolve(env.OPENDOTS_ROOT||path.join(repoRoot,'.opendots/upstream')),dataDir:path.resolve(env.OPENDOTS_DATA_DIR||path.join(repoRoot,'.opendots/data')),outputDir:path.resolve(env.OPENDOTS_OUTPUT_DIR||path.join(repoRoot,'.opendots/results')),endpoint,approvedRemoteOrigin:'https://meulocal.ia.br',apiKey:env.MEULOCAL_PROSPECTOR_API_KEY,intelligenceKey:env.CPK_INTELLIGENCE_API_KEY,modelKey:env.OPENAI_API_KEY,model,mode,limit,ownerId:'meulocal-research-local'};
}
module.exports={configuration};
