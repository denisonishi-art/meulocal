import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createHmac,timingSafeEqual,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {createReceiptStore} from './commercial-receipts.mjs';
const require=createRequire(import.meta.url);
const {decideCommercialEvent,validateEvent}=require('./commercial-engine.cjs');
const ROOT=path.resolve(import.meta.dirname,'../..');
function sameSignature(payload,provided,secret){
 const expected=Buffer.from('sha256='+createHmac('sha256',secret).update(payload).digest('hex'));
 const actual=Buffer.from(provided||'');return expected.length===actual.length&&timingSafeEqual(expected,actual);
}
async function bodyText(req){let s='';for await(const part of req){s+=part;if(Buffer.byteLength(s)>32768)throw Error('payload_too_large')}return s}
function createReceiver({secret,modelTurn,receipts}){
 const inFlight=new Map();
 if(!receipts)throw Error('durable_receipts_required');
 if(!secret||secret.length<24)throw Error('OPENDOTS_COMMERCIAL_SECRET_required');
 return http.createServer(async(req,res)=>{
  const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data))};
  if(req.method==='GET'&&req.url==='/health')return reply(200,{status:'ready',runtime:'opendots',dispatch:false});
  if(req.method!=='POST'||req.url!=='/commercial/inbound'||req.headers.origin)return reply(404,{error:'not_found'});
  let raw;try{raw=await bodyText(req)}catch{return reply(413,{error:'payload_too_large'})}
  if(!sameSignature(raw,req.headers['x-meulocal-signature'],secret))return reply(401,{error:'invalid_signature'});
  let event;try{event=JSON.parse(raw)}catch{return reply(400,{error:'invalid_json'})}
  try{
   validateEvent(event);
   const saved=receipts.read(event);
   if(saved)return reply(200,saved);
   // A timeout does not cancel the model or let concurrent retries start another turn.
   const fingerprint=receipts.fingerprint(event),pending=inFlight.get(event.eventId);
   if(pending&&pending.fingerprint!==fingerprint)return reply(409,{error:'event_payload_conflict'});
   let promise=pending?.promise;
   if(!promise){
    promise=(async()=>{const decision=await decideCommercialEvent(event,{modelTurn});return receipts.save(decision,event)})();
    inFlight.set(event.eventId,{fingerprint,promise});
   }
   try{return reply(200,await promise)}finally{if(inFlight.get(event.eventId)?.promise===promise)inFlight.delete(event.eventId)}
  }catch(err){return reply(String(err.message).includes('conflict')?409:422,{error:String(err.message||err).slice(0,120)})}

 });
}
async function start(){
 const {bootstrapWorkspace}=await import('./workspace-bootstrap.mjs');
 const identity=JSON.parse(fs.readFileSync(new URL('./dot-identity.json',import.meta.url),'utf8'));
 const secret=process.env.OPENDOTS_COMMERCIAL_SECRET;
 const official=path.resolve(process.env.OPENDOTS_ROOT||path.join(ROOT,'.opendots/upstream'));
 const dataDir=path.resolve(process.env.OPENDOTS_DATA_DIR||path.join(ROOT,'.opendots/data'));
 const intelligenceKey=process.env.CPK_INTELLIGENCE_API_KEY,apiKey=process.env.OPENAI_API_KEY;
 if(!intelligenceKey||!apiKey)throw Error('model_credentials_missing');
 fs.mkdirSync(dataDir,{recursive:true,mode:0o700});
 const load=name=>import(pathToFileURL(path.join(official,'dist/server/server',name+'.js')));
 const {WorkspaceStore}=await load('workspace'),{Store}=await load('store'),{Platform}=await load('platform');
 const database=path.join(dataDir,'workspace.sqlite');
 const workspace=bootstrapWorkspace(WorkspaceStore,database,'meulocal-research-local',identity);
 const store=new Store(database);
 if(store.settings().paused)throw Error('worker_paused');
 const ownerToken=randomUUID();
 let platform;
 const runtime=http.createServer(async(req,res)=>{
  try{
   if(req.headers.origin||req.headers.authorization!=='Bearer '+ownerToken){res.writeHead(401);return res.end()}
   const url='http://127.0.0.1:'+runtime.address().port+req.url;
   const body=['GET','HEAD'].includes(req.method)?undefined:await bodyText(req);
   const response=await platform.handle(new Request(url,{method:req.method,headers:req.headers,...(body===undefined?{}:{body})}));
   res.writeHead(response.status,Object.fromEntries(response.headers));
   if(response.body){for await(const chunk of response.body)res.write(chunk)}
   res.end();
  }catch(error){console.error('opendots_runtime_request_failed',String(error?.message||error).slice(0,160));if(!res.headersSent)res.writeHead(500);res.end()}
 });
 await new Promise((resolve,reject)=>{runtime.once('error',reject);runtime.listen(0,'127.0.0.1',resolve)});
 const runtimeUrl='http://127.0.0.1:'+runtime.address().port+'/api/copilotkit';
 platform=new Platform(store,workspace,{intelligenceKey,model:'gpt-4.1-mini-2025-04-14',apiKey,runtimeUrl,ownerToken,voiceName:'alloy',slackUsers:[],webSearchProvider:'disabled'});
 await platform.start();
 const outputDir=path.join(dataDir,'commercial-decisions');fs.mkdirSync(outputDir,{recursive:true,mode:0o700});
 const server=createReceiver({secret,modelTurn:async prompt=>{
  const conversation=await platform.createConversation(identity.id,'MeuLocal comercial '+new Date().toISOString());
  return platform.turn(conversation.id,prompt,AbortSignal.timeout(90000));
 },receipts:createReceiptStore(outputDir,secret)});
 const port=Number(process.env.OPENDOTS_COMMERCIAL_PORT||8787);
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'0.0.0.0',resolve)});
 console.log(JSON.stringify({status:'READY',port,service:'opendots_commercial',dispatch:false}));
 const close=async()=>{server.close();runtime.closeAllConnections?.();await new Promise(resolve=>runtime.close(resolve));await platform.stop();workspace.close();store.close()};
 process.once('SIGTERM',()=>{void close()});process.once('SIGINT',()=>{void close()});
}
export {createReceiver,sameSignature};
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename))start().catch(e=>{console.error(JSON.stringify({status:'BLOCKED',reason:e.message}));process.exitCode=1});