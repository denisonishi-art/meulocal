import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import {randomUUID,randomBytes} from 'node:crypto';import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';
import {bootstrapWorkspace} from './workspace-bootstrap.mjs';
const require=createRequire(import.meta.url);
const {configuration}=require('./remote-config.cjs'),{createMcpBridge}=require('./mcp-server.cjs'),{textDelta}=require('./agent-text.cjs');
const {classifyExternalFailure,cleanupOwnedResources}=require('./external-failures.cjs');
const repoRoot=path.resolve(import.meta.dirname,'../..');
const identity=JSON.parse(fs.readFileSync(new URL('./dot-identity.json',import.meta.url),'utf8'));
const listen=server=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve('http://127.0.0.1:'+server.address().port))});
const close=server=>new Promise(resolve=>{if(!server?.listening)return resolve();server.closeAllConnections?.();server.close(resolve)});
async function readBody(req){let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>100000)throw Error('request_too_large')}return body}
export async function runResearch(config,{fetch:transport=globalThis.fetch,preflight=false}={}){
 if(process.versions.node!=='24.21.0')throw Error('Node_24_21_0_required');
 const cp=require('node:child_process'),revision=cp.execFileSync('git',['rev-parse','HEAD'],{cwd:config.official,encoding:'utf8'}).trim();
 if(revision!=='625452e06cde74cb25b0ce319e2c1be0488f5a5f')throw Error('upstream_revision_mismatch');
 process.env.DO_NOT_TRACK='1';process.env.COPILOTKIT_TELEMETRY_DISABLED='true';
 fs.mkdirSync(config.dataDir,{recursive:true,mode:0o700});fs.mkdirSync(config.outputDir,{recursive:true,mode:0o700});
 const lock=path.join(config.dataDir,'research.lock');const fd=fs.openSync(lock,'wx',0o600);fs.closeSync(fd);
 const runId=randomUUID(),report={runId,observedAt:new Date().toISOString(),mode:config.mode,agentId:identity.id,intelligenceProject:'meulocal-prospeccao-dev',intelligenceProjectId:12275,upstream:revision,model:config.model,status:'NOT_VERIFIED',stages:[],modelRequests:[],sourceRequests:0,commercialEligibility:'NOT_VERIFIED',crmWrites:0,outboundMessages:0};
 const reportPath=path.join(config.outputDir,runId+'.json');
 const save=()=>fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n',{mode:0o600});
 const stage=value=>{report.stages.push(value);save()};
 let workspace,store,platform,bridge,proxy,runtime,connection;let ownerToken=randomBytes(32).toString('hex');
 const redact=value=>[config.apiKey,config.intelligenceKey,config.modelKey,ownerToken].reduce((text,key)=>text.split(key).join('[REDACTED]'),String(value));
 try{
  const load=name=>import(pathToFileURL(path.join(config.official,'dist/server/server',name+'.js')));
  const {WorkspaceStore}=await load('workspace'),{Store}=await load('store'),{Platform}=await load('platform');
  workspace=bootstrapWorkspace(WorkspaceStore,path.join(config.dataDir,'workspace.sqlite'),config.ownerId,identity);
  store=new Store(path.join(config.dataDir,'workspace.sqlite'));if(store.settings().paused)throw Error('worker_paused');store.updateSettings({researchAllowed:false,memoryAllowed:false});
  if(workspace.connections.list(identity.id).some(c=>c.enabled))throw Error('unexpected_existing_connection');
  if(preflight){report.status='PREFLIGHT_LOCAL_ONLY';report.authentication='NOT_VERIFIED';report.missingCredentials=config.missingCredentials||[];stage('portable_upstream_and_existing_identity_validated');return report}
  bridge=createMcpBridge({openDotsRoot:config.official,repoRoot:config.repoRoot,endpoint:config.endpoint,approvedRemoteOrigin:config.approvedRemoteOrigin,apiKey:config.apiKey,sourceEndpoint:config.discoveryEndpoint,segment:config.segment,city:config.city,state:config.state,sourceProvider:'meulocal_backend',token:ownerToken,onResearchComplete:result=>{report.research=result;stage('qualification_confirmed_by_adapter')},fetch:async(url,init)=>{
   if(url===(config.discoveryEndpoint||'https://meulocal.ia.br/api/places/search')){
    if(report.sourceRequests>=1)throw Error('source_request_budget_exhausted');report.sourceRequests++;stage('source_requested');
    const response=await transport(url,init);report.sourceHttpStatus=response.status;
    const data=await response.clone().json();report.sourceReturned=Array.isArray(data.places)?data.places.length:null;
    report.observedPlaces=(data.places||[]).slice(0,config.limit).map(p=>({id:p.id,name:p.name,rating:p.rating,reviewCount:p.reviewCount,website:p.website}));save();return response;
   }
   if(url!==config.endpoint)throw Error('qualification_destination_denied');
   const response=await transport(url,init);report.qualificationHttpStatus=response.status;if(response.ok)report.qualification=await response.clone().json();stage('qualification_response_received');return response;
  }});const bridgeUrl=await listen(bridge);
  proxy=http.createServer(async(req,res)=>{
   try{
    if(req.headers.origin||req.url!=='/v1/chat/completions'||req.method!=='POST'||req.headers.authorization!=='Bearer '+config.modelKey){res.writeHead(403);return res.end()}
    if(report.modelRequests.length>=3||report.modelRequests.some(r=>r.status>=400)){res.writeHead(429);return res.end('{"error":{"message":"Research limit reached"}}')}
    const data=JSON.parse(await readBody(req));if(data.model!==config.model)throw Error('model_mismatch');
    data.max_completion_tokens=2000;delete data.max_tokens;if(data.stream)data.stream_options={...data.stream_options,include_usage:true};
    const observed={status:null,usage:null};report.modelRequests.push(observed);save();
    const response=await transport('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+config.modelKey},body:JSON.stringify(data),redirect:'error',signal:AbortSignal.timeout(60000)});
    observed.status=response.status;res.writeHead(response.status,{'Content-Type':response.headers.get('content-type')||'application/json'});
    let pending='';for await(const chunk of response.body){res.write(chunk);pending+=Buffer.from(chunk).toString();const lines=pending.split('\n');pending=lines.pop();for(const line of lines){try{const item=JSON.parse(line.replace(/^data: /,''));if(item.usage)observed.usage=item.usage;if(item.error)observed.errorCode=item.error.code||item.error.type}catch{}}}
    try{const item=JSON.parse(pending);if(item.usage)observed.usage=item.usage;if(item.error)observed.errorCode=item.error.code||item.error.type}catch{}
    save();res.end();
   }catch{if(!res.headersSent)res.writeHead(502);res.end()}
  });const proxyUrl=await listen(proxy);
  runtime=http.createServer(async(req,res)=>{
   try{
    if(req.headers.origin||req.headers.authorization!=='Bearer '+ownerToken){res.writeHead(401);return res.end()}
    const response=await platform.handle(new Request(runtimeUrl+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:await readBody(req)}:{})}));res.writeHead(response.status,Object.fromEntries(response.headers));for await(const chunk of response.body)res.write(chunk);res.end();
   }catch{if(!res.headersSent)res.writeHead(500);res.end()}
  });const runtimeUrl=await listen(runtime);
  platform=new Platform(store,workspace,{intelligenceKey:config.intelligenceKey,model:config.model,apiKey:config.modelKey,baseUrl:proxyUrl+'/v1',runtimeUrl:runtimeUrl+'/api/copilotkit',ownerToken,voiceName:'alloy',slackUsers:[],webSearchProvider:'disabled'});
  connection=await platform.connections.add(identity.id,{name:'MeuLocal Research',url:bridgeUrl+'/mcp',token:ownerToken});stage('official_mcp_connected');
  const prompt=`Use somente a conexão MeuLocal Research: research_readiness e research_generator_prospects uma única vez, limit=${config.limit}. Não use outras ferramentas, não salve páginas, não envie mensagens e não faça retries. Apresente nomes, externalId, score, evidências e um rascunho por empresa realmente qualificada, no máximo três, para revisão humana de observação consultiva útil, identificação Denis, fundador da MeuLocal e pedido de permissão para compartilhar diagnóstico. Não mencione preço no primeiro contato. Não produza terceiros genéricos. Não invente dados, condições contratuais como "sem compromisso", nem prometa resultados. Nota média não comprova notas individuais. CRM, supressões, opt-out, status operacional e consentimento são NOT_VERIFIED. Todos os resultados permanecem pending_review. A mensagem aprovada ainda deve ser recuperada: identifique todos os rascunhos como não aprovados. Nunca autorize contato ou follow-up.`;
  if(config.mode==='intelligence'){
   await platform.start();const conversation=await platform.createConversation(identity.id,'MeuLocal research '+runId);report.threadId=conversation.id;stage('intelligence_thread_created');
   report.answer=await platform.turn(conversation.id,prompt,AbortSignal.timeout(120000));
  }else{
   report.intelligencePersistence='NOT_VERIFIED_DIAGNOSTIC_ONLY';report.threadId=randomUUID();workspace.bindThread(report.threadId,identity.id,'Explicit local diagnostic '+runId);
   const {DotAgent}=await load('dot-agent');const agent=new DotAgent(store,workspace,platform.config,identity.id);report.tools=[];
   report.answer=await new Promise((resolve,reject)=>{let text='';const timeout=setTimeout(()=>{agent.abortRun();reject(Error('diagnostic_timeout'))},110000);
    agent.run({threadId:report.threadId,runId,state:{},tools:[],context:[],forwardedProps:{},messages:[{id:randomUUID(),role:'user',content:prompt}]}).subscribe({next:event=>{if(event.toolCallName)report.tools.push(event.toolCallName);text+=textDelta(event);if(event.type==='RUN_ERROR'){clearTimeout(timeout);reject(Error('official_agent_run_error'))}},error:error=>{clearTimeout(timeout);reject(error)},complete:()=>{clearTimeout(timeout);resolve(text)}});
   });
  }
  const assessment=report.research?.assessments,ids=assessment?.map(a=>a.lead.externalId)||[];
  if(report.sourceRequests!==1||report.sourceHttpStatus!==200||report.qualificationHttpStatus!==200||!Array.isArray(assessment)||ids.length!==new Set(ids).size||!report.answer?.trim())throw Error('research_confirmation_missing');
  report.status=config.mode==='intelligence'?'INTELLIGENCE_RESEARCH_VERIFIED':'LOCAL_DIAGNOSTIC_RESEARCH_VERIFIED';stage('research_finished');
 }catch(error){report.failure=redact(error?.message||'worker_failed').slice(0,300);report.failureClass=classifyExternalFailure(error);report.retryPolicy='no_automatic_retry';report.status='BLOCKED';save()}
 finally{
  const failed=await cleanupOwnedResources([
   {name:'own_mcp_connection',close:()=>connection&&workspace.connections.remove(connection.id)},
   {name:'platform',close:()=>platform?.stop()},
   {name:'runtime',close:()=>close(runtime)},{name:'bridge',close:()=>close(bridge)},{name:'proxy',close:()=>close(proxy)},
   {name:'workspace',close:()=>workspace?.close()},{name:'store',close:()=>store?.close()},
   {name:'own_lock',close:()=>fs.unlinkSync(lock)}
  ]);
  report.cleanupFailures=failed;
  report.cleanup=failed.length?'PARTIAL_FAILURE':'OWNED_RESOURCES_CLOSED';if(failed.length)report.status='BLOCKED';
  const usages=report.modelRequests.map(r=>r.usage).filter(Boolean);report.measuredUsage=usages.length>0&&usages.length===report.modelRequests.length;
  report.tokens={input:usages.reduce((s,u)=>s+(u.prompt_tokens||0),0),cached:usages.reduce((s,u)=>s+(u.prompt_tokens_details?.cached_tokens||0),0),output:usages.reduce((s,u)=>s+(u.completion_tokens||0),0)};
  report.estimatedModelUSD=report.measuredUsage?((report.tokens.input-report.tokens.cached)*0.40+report.tokens.cached*0.10+report.tokens.output*1.60)/1000000:null;
  save();
 }
 return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 try{const env=require('./credential-environment.cjs').credentialEnvironment(process.env),config=configuration(env,repoRoot,{preflight:process.argv.includes('--preflight')}),report=await runResearch(config,{preflight:process.argv.includes('--preflight')});console.log(JSON.stringify({status:report.status,runId:report.runId,sourceRequests:report.sourceRequests,modelRequests:report.modelRequests.length,commercialEligibility:report.commercialEligibility,outputDir:config.outputDir}));if(report.status==='BLOCKED')process.exitCode=1}
 catch(error){console.error(JSON.stringify({status:'BLOCKED_CONFIGURATION',reason:error.message}));process.exitCode=1}
}
