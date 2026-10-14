// Supervised local validation only. No scheduler, CRM writer or outbound tools.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'../..');
const official=path.resolve(process.env.OPENDOTS_ROOT||path.join(root,'.opendots/upstream'));
const draftExisting=process.argv.includes('--draft-existing');
const localAgent=draftExisting||process.argv.includes('--local-agent');
const env=createRequire(import.meta.url)('./credential-environment.cjs').credentialEnvironment(process.env);
if(!env.OPENAI_API_KEY||!env.CPK_INTELLIGENCE_API_KEY)throw Error('local_credentials_missing');
if(env.OPENAI_MODEL!=='gpt-4.1-mini-2025-04-14')throw Error('model_mismatch');
process.env.DO_NOT_TRACK='1';process.env.COPILOTKIT_TELEMETRY_DISABLED='true';
const require=createRequire(import.meta.url);
const load=name=>import(pathToFileURL(path.join(official,'dist/server/server',name+'.js')));
const {Store}=await load('store'),{WorkspaceStore}=await load('workspace'),{Platform}=await load('platform');
const {createMcpBridge}=require('./mcp-server.cjs');
const dir=path.resolve(process.env.OPENDOTS_OUTPUT_DIR||path.join(root,'.opendots/results',new Date().toISOString().replace(/[:.]/g,'-')));fs.mkdirSync(dir,{recursive:true,mode:0o700});
const record={observedAt:new Date().toISOString(),executionMode:draftExisting?'official_DotAgent_draft_from_recorded_real_evidence':localAgent?'official_DotAgent_local_diagnostic':'Intelligence_headless_turn',model:env.OPENAI_MODEL,keySource:process.env.OPENDOTS_ENV_FILE?'explicit file overrides inherited credentials':'explicit process environment',stages:[],modelRequests:[],sourceRequests:0,messagesSent:0,crmWrites:0,remoteMigrations:0,status:'NOT_VERIFIED'};
const save=()=>fs.writeFileSync(path.join(dir,draftExisting?'selected-drafts.json':'cycle.json'),JSON.stringify(record,null,2)+'\n');
const stage=value=>{record.stages.push(value);save();console.log(value)};
const listen=server=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve('http://127.0.0.1:'+server.address().port))});
const close=server=>new Promise(resolve=>{if(!server?.listening)return resolve();server.closeAllConnections?.();server.close(resolve)});
const body=async req=>{let result='';for await(const chunk of req){result+=chunk;if(result.length>100000)throw Error('request_too_large')}return result};
const key=randomBytes(32).toString('hex'),token=randomBytes(32).toString('hex');
const previous=process.env.MEULOCAL_PROSPECTOR_API_KEY;process.env.MEULOCAL_PROSPECTOR_API_KEY=key;
const intelligence=require('./test-loader.cjs')()(path.join(root,'lib/agents/prospect-intelligence.ts'));
const route=require('./test-loader.cjs')({'@/lib/agents/prospect-intelligence':intelligence})(path.join(root,'app/api/agents/prospecting/route.ts'));
let qualifier,bridge,proxy,runtime,store,workspace,platform,connection;
try{
 qualifier=http.createServer(async(req,res)=>{try{if(req.url!=='/api/agents/prospecting'||req.method!=='POST'){res.writeHead(404);return res.end()}const response=await route.POST(new Request('http://127.0.0.1/api/agents/prospecting',{method:'POST',headers:req.headers,body:await body(req)}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text())}catch{res.writeHead(500);res.end()}});
 const qualificationUrl=await listen(qualifier);
 bridge=createMcpBridge({openDotsRoot:official,repoRoot:root,endpoint:qualificationUrl+'/api/agents/prospecting',apiKey:key,token,sourceProvider:'meulocal_backend',fetch:async(url,init)=>{
  if(url==='https://meulocal.ia.br/api/places/search'){
   if(draftExisting)throw Error('research_disabled_draft_only');
   if(++record.sourceRequests>1)throw Error('single_research_limit');
   const response=await fetch(url,init);record.sourceHttpStatus=response.status;
   const data=await response.clone().json();fs.writeFileSync(path.join(dir,'private-source.json'),JSON.stringify(data),{mode:0o600});stage('real_backend_received');return response;
  }
  if(url!==qualificationUrl+'/api/agents/prospecting')throw Error('unexpected_destination');
  const response=await fetch(url,init);const result=await response.clone().json();record.qualificationHttpStatus=response.status;record.qualification=result;stage('private_local_qualification');return response;
 }});
 const bridgeUrl=await listen(bridge);
 proxy=http.createServer(async(req,res)=>{
  try{
   if(req.url!=='/v1/chat/completions'||req.method!=='POST'||req.headers.authorization!=='Bearer '+env.OPENAI_API_KEY){res.writeHead(403);return res.end()}
   if(record.modelRequests.length>=3||record.modelRequests.some(r=>r.status>=400)){res.writeHead(429);return res.end('{"error":{"message":"Supervised validation stopped","type":"validation_limit"}}')}
   const data=JSON.parse(await body(req));if(data.model!==env.OPENAI_MODEL)throw Error('model_mismatch');
   data.max_completion_tokens=2000;delete data.max_tokens;if(data.stream)data.stream_options={...data.stream_options,include_usage:true};
   const observation={model:data.model,status:null,usage:null};record.modelRequests.push(observation);save();
   const response=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.OPENAI_API_KEY},body:JSON.stringify(data),signal:AbortSignal.timeout(60000),redirect:'error'});
   observation.status=response.status;res.writeHead(response.status,{'Content-Type':response.headers.get('content-type')||'application/json'});
   let pending='';for await(const chunk of response.body){res.write(chunk);pending+=Buffer.from(chunk).toString();const lines=pending.split('\n');pending=lines.pop();for(const line of lines){try{const item=JSON.parse(line.replace(/^data: /,''));if(item.usage)observation.usage=item.usage;if(item.error)observation.errorCode=item.error.code||item.error.type}catch{}}}
   if(pending){try{const item=JSON.parse(pending);if(item.usage)observation.usage=item.usage;if(item.error)observation.errorCode=item.error.code||item.error.type}catch{}}
   save();res.end();stage('model_response_'+response.status);
  }catch{if(!res.headersSent)res.writeHead(502);res.end();stage('model_proxy_failed')}
 });const proxyUrl=await listen(proxy);
 const db=path.resolve(official,env.DATABASE_PATH||'data/meulocal-local-validation/workspace.sqlite');store=new Store(db);workspace=new WorkspaceStore(db,env.OWNER_ID||'meulocal-research-local');
 const dot=workspace.dots().find(d=>d.name==='MeuLocal Geradores SP');if(!dot)throw Error('existing_dot_missing');
 if(workspace.connections.list(dot.id).some(c=>c.enabled))throw Error('unexpected_existing_connection');
 runtime=http.createServer(async(req,res)=>{try{const response=await platform.handle(new Request(runtimeUrl+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:await body(req)}:{})}));res.writeHead(response.status,Object.fromEntries(response.headers));for await(const chunk of response.body)res.write(chunk);res.end()}catch{if(!res.headersSent)res.writeHead(500);res.end()}});const runtimeUrl=await listen(runtime);
 platform=new Platform(store,workspace,{intelligenceKey:env.CPK_INTELLIGENCE_API_KEY,model:env.OPENAI_MODEL,apiKey:env.OPENAI_API_KEY,baseUrl:proxyUrl+'/v1',runtimeUrl:runtimeUrl+'/api/copilotkit',voiceName:'alloy',slackUsers:[],webSearchProvider:'disabled'});
 connection=await platform.connections.add(dot.id,{name:'MeuLocal Research',url:bridgeUrl+'/mcp',token});stage('official_mcp_connected');
 let prompt='Execute uma única vez research_readiness e depois research_generator_prospects com limit=5. Use somente essa conexão. Não chame outras ferramentas nem salve páginas. Com os resultados reais, produza até três rascunhos personalizados para revisão humana, em português, para gestão de avaliações Google por R$397/mês, sem prometer resultados. Cite apenas métricas observadas, nome e externalId. Não deduza consentimento, status operacional, ausência de opt-out ou aprovação comercial. Deixe explícito NOT_VERIFIED quando necessário. Nunca envie mensagens. Termine sem novas buscas.';
 if(draftExisting){
  const prior=JSON.parse(fs.readFileSync(path.join(root,'docs/evidence/opendots-intelligence-resume-2026-10-13/real-backend-assessments.json'),'utf8'));
  record.sourceEvidence='opendots-intelligence-resume-2026-10-13/real-backend-assessments.json';record.sourceObservedAt=prior.observedAt;
  const selected=prior.assessments.filter(a=>a.score>0);record.qualification={assessments:selected};
  prompt='Redija exatamente três abordagens curtas, uma para cada empresa nos dados reais abaixo. Não use ferramentas, não pesquise, não salve páginas e não envie mensagens. Preserve os IDs e números observados na data indicada; não são uma nova pesquisa. Oferta: gestão de avaliações Google por R$397/mês. Sem promessas de resultados, comparação com concorrentes ou pressuposição de avaliações sem resposta. Pergunte se pode explicar o serviço e inclua opção simples de recusa. Identifique o remetente apenas como equipe MeuLocal. Fora das mensagens deixe claro pending_review e NOT_VERIFIED para consentimento, opt-out, duplicatas no GHL e status operacional. Dados reais observados em '+prior.observedAt+': '+JSON.stringify(selected);
 }
 let answer;
 if(localAgent){
  const prior=JSON.parse(fs.readFileSync(process.env.OPENDOTS_PREVIOUS_INTELLIGENCE_EVIDENCE||path.join(root,'docs/evidence/opendots-real-cycle-2026-10-13/intelligence-attempt.json'),'utf8'));
  workspace.requireThread(prior.threadId,dot.id);record.threadId=prior.threadId;
  const {DotAgent}=await load('dot-agent');const agent=new DotAgent(store,workspace,platform.config,dot.id);
  record.events=[];stage('official_local_agent_started');
  answer=await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>{agent.abortRun();reject(Error('diagnostic_timeout'))},110000);
   agent.run({threadId:prior.threadId,runId:randomBytes(16).toString('hex'),state:{},tools:[],context:[],forwardedProps:{},messages:[{id:randomBytes(16).toString('hex'),role:'user',content:prompt}]}).subscribe({next:event=>{record.events.push({type:event.type,...(event.toolCallName?{tool:event.toolCallName}:{})});text+=require('./agent-text.cjs').textDelta(event);if(event.type==='RUN_ERROR'){clearTimeout(timer);reject(Error('official_agent_run_error'))}},error:error=>{clearTimeout(timer);reject(error)},complete:()=>{clearTimeout(timer);resolve(text)}});
  });
 }else{
  await platform.start();stage('intelligence_runtime_ready');
  const conversation=await platform.createConversation(dot.id,'Validação supervisionada — 5 geradores SP — 13/10/2026');record.threadId=conversation.id;stage('intelligence_conversation_created');
  answer=await platform.turn(conversation.id,prompt,AbortSignal.timeout(120000));
 }
 record.answer=answer;record.status=draftExisting&&answer.trim()?'REAL_EVIDENCE_DRAFTS_GENERATED':record.sourceRequests===1&&record.qualification?.assessments?.length&&answer.trim()?(localAgent?'LOCAL_AGENT_CYCLE_EXECUTED':'REAL_CYCLE_EXECUTED'):'PARTIAL';stage('native_turn_finished');
}catch(error){record.failureClass=error?.name||'Error';record.failure=String(error?.message||'failed').replace(/(?:sk-|cpk_)[A-Za-z0-9_-]+/g,'[REDACTED]').slice(0,300);stage('validation_blocked')}
finally{
 if(connection)workspace.connections.remove(connection.id);
 await platform?.stop().catch(()=>{});await close(runtime);await close(bridge);await close(qualifier);await close(proxy);workspace?.close();store?.close();
 if(previous===undefined)delete process.env.MEULOCAL_PROSPECTOR_API_KEY;else process.env.MEULOCAL_PROSPECTOR_API_KEY=previous;
 const usages=record.modelRequests.map(r=>r.usage).filter(Boolean);record.measuredUsage=usages.length===record.modelRequests.length&&usages.length>0;
 record.tokens={input:usages.reduce((s,u)=>s+(u.prompt_tokens||0),0),cached:usages.reduce((s,u)=>s+(u.prompt_tokens_details?.cached_tokens||0),0),output:usages.reduce((s,u)=>s+(u.completion_tokens||0),0)};
 record.estimatedModelUSD=record.measuredUsage?((record.tokens.input-record.tokens.cached)*0.40+record.tokens.cached*0.10+record.tokens.output*1.60)/1000000:null;
 record.cleanup='loopback servers closed; temporary MCP connection removed; no scheduler';save();console.log(JSON.stringify({status:record.status,requests:record.modelRequests.map(r=>({status:r.status,errorCode:r.errorCode})),sourceRequests:record.sourceRequests,usage:record.measuredUsage}));
}
