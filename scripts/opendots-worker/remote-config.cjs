'use strict';
const path=require('node:path');
function configuration(env,repoRoot,{preflight=false}={}){
 const missingCredentials=['OPENAI_API_KEY','CPK_INTELLIGENCE_API_KEY','MEULOCAL_PROSPECTOR_API_KEY'].filter(key=>!env[key]?.trim());
 if(!preflight&&missingCredentials.length)throw Error('missing_'+missingCredentials[0]);
 const segment=(env.MEULOCAL_RESEARCH_SEGMENT||'geradores').trim().toLowerCase();
 if(!['geradores','buffets','pizzarias','escolas','despachantes','academias','clinicas','servicos locais'].includes(segment))throw Error('segment_invalid');
 const endpoint=env.MEULOCAL_PROSPECTOR_ENDPOINT||'https://meulocal.ia.br/api/agents/prospecting';
 const url=new URL(endpoint);if(url.href!=='https://meulocal.ia.br/api/agents/prospecting')throw Error('endpoint_not_authorized');
 const mode=env.OPENDOTS_EXECUTION_MODE||'intelligence';if(!['intelligence','local_diagnostic'].includes(mode))throw Error('mode_invalid');
 const limit=Number(env.MEULOCAL_RESEARCH_LIMIT||5);if(!Number.isInteger(limit)||limit<1||limit>20)throw Error('limit_invalid');
 const model=env.OPENAI_MODEL||'gpt-4.1-mini-2025-04-14';if(model!=='gpt-4.1-mini-2025-04-14')throw Error('model_not_reviewed');
 return {discoveryEndpoint:'https://meulocal.ia.br/api/agents/prospecting/discover',segment,city:'Sao Paulo',state:'SP',missingCredentials,repoRoot:path.resolve(repoRoot),official:path.resolve(env.OPENDOTS_ROOT||path.join(repoRoot,'.opendots/upstream')),dataDir:path.resolve(env.OPENDOTS_DATA_DIR||path.join(repoRoot,'.opendots/data')),outputDir:path.resolve(env.OPENDOTS_OUTPUT_DIR||path.join(repoRoot,'.opendots/results')),endpoint,approvedRemoteOrigin:'https://meulocal.ia.br',apiKey:env.MEULOCAL_PROSPECTOR_API_KEY,intelligenceKey:env.CPK_INTELLIGENCE_API_KEY,modelKey:env.OPENAI_API_KEY,model,mode,limit,ownerId:'meulocal-research-local'};
}
module.exports={configuration};
