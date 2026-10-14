'use strict';
const path=require('node:path');
function configuration(env,repoRoot,{preflight=false}={}){
 const missingCredentials=['OPENAI_API_KEY','CPK_INTELLIGENCE_API_KEY','MEULOCAL_PROSPECTOR_API_KEY'].filter(key=>!env[key]?.trim());
 if(!preflight&&missingCredentials.length)throw Error('missing_'+missingCredentials[0]);
 const segments=['geradores','buffets','pizzarias','restaurantes','imobiliarias','lojas de colchoes','escolas','despachantes','academias','clinicas','pet shops','oficinas','saloes de beleza','servicos locais'];
 const requestedSegment=(env.MEULOCAL_RESEARCH_SEGMENT||'geradores').trim().toLowerCase();
 if(requestedSegment!=='automatico'&&!segments.includes(requestedSegment))throw Error('segment_invalid');
 // Rotate one sector per authorized run. One bounded Google request, no extra spend or outreach.
 const date=env.MEULOCAL_RESEARCH_DATE||new Date().toISOString().slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z')))throw Error('research_date_invalid');
 const segment=requestedSegment==='automatico'?segments[Math.floor(Date.parse(date+'T00:00:00Z')/86400000)%segments.length]:requestedSegment;
 const endpoint=env.MEULOCAL_PROSPECTOR_ENDPOINT||'https://meulocal.ia.br/api/agents/prospecting';
 const url=new URL(endpoint);if(url.href!=='https://meulocal.ia.br/api/agents/prospecting')throw Error('endpoint_not_authorized');
 const mode=env.OPENDOTS_EXECUTION_MODE||'intelligence';if(!['intelligence','local_diagnostic'].includes(mode))throw Error('mode_invalid');
 const limit=Number(env.MEULOCAL_RESEARCH_LIMIT||5);if(!Number.isInteger(limit)||limit<1||limit>20)throw Error('limit_invalid');
 const model=env.OPENAI_MODEL||'gpt-4.1-mini-2025-04-14';if(model!=='gpt-4.1-mini-2025-04-14')throw Error('model_not_reviewed');
 return {discoveryEndpoint:'https://meulocal.ia.br/api/agents/prospecting/discover',segment,city:'Sao Paulo',state:'SP',missingCredentials,repoRoot:path.resolve(repoRoot),official:path.resolve(env.OPENDOTS_ROOT||path.join(repoRoot,'.opendots/upstream')),dataDir:path.resolve(env.OPENDOTS_DATA_DIR||path.join(repoRoot,'.opendots/data')),outputDir:path.resolve(env.OPENDOTS_OUTPUT_DIR||path.join(repoRoot,'.opendots/results')),endpoint,approvedRemoteOrigin:'https://meulocal.ia.br',apiKey:env.MEULOCAL_PROSPECTOR_API_KEY,intelligenceKey:env.CPK_INTELLIGENCE_API_KEY,modelKey:env.OPENAI_API_KEY,model,mode,limit,ownerId:'meulocal-research-local'};
}
module.exports={configuration};
