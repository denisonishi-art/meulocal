import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createHmac,timingSafeEqual,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {bootstrapWorkspace} from './workspace-bootstrap.mjs';
const require=createRequire(import.meta.url);
const {decideCommercialEvent}=require('./commercial-engine.cjs');
const identity=JSON.parse(fs.readFileSync(new URL('./dot-identity.json',import.meta.url),'utf8'));
const ROOT=path.resolve(import.meta.dirname,'../..');
function sameSignature(payload,provided,secret){
 const expected=Buffer.from('sha256='+createHmac('sha256',secret).update(payload).digest('hex'));
 const actual=Buffer.from(provided||'');return expected.length===actual.length&&timingSafeEqual(expected,actual);
}
async function bodyText(req){let s='';for await(const part of req){s+=part;if(Buffer.byteLength(s)>12000)throw Error('payload_too_large')}return s}
function createReceiver({secret,modelTurn,onDecision,seen=new Set()}){
 if(!secret||secret.length<24)throw Error('OPENDOTS_COMMERCIAL_SECRET_required');
 return http.createServer(async(req,res)=>{
  const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data))};
  if(req.method==='GET'&&req.url==='/health')return reply(200,{status:'ready',runtime:'opendots',dispatch:false});
  if(req.method!=='POST'||req.url!=='/commercial/inbound'||req.headers.origin)return reply(404,{error:'not_found'});
  let raw;try{raw=await bodyText(req)}catch{return reply(413,{error:'payload_too_large'})}
  if(!sameSignature(raw,req.headers['x-meulocal-signature'],secret))return reply(401,{error:'invalid_signature'});
  let event;try{event=JSON.parse(raw)}catch{return reply(400,{error:'invalid_json'})}
  if(!event.eventId||seen.has(event.eventId))return reply(200,{status:'duplicate',eventId:event.eventId||null});
  try{
   const decision=await decideCommercialEvent(event,{modelTurn});
   await onDecision(decision,event);
   seen.add(event.eventId);
   return reply(200,{status:'decision_saved',eventId:event.eventId,action:decision.action,dispatched:0});
  }catch(err){return reply(422,{error:String(err.message||err).slice(0,120)})}
 });
}
async function start(){
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
 const platform=new Platform(store,workspace,{intelligenceKey,model:'gpt-4.1-mini-2025-04-14',apiKey,ownerToken:randomUUID(),voiceName:'alloy',slackUsers:[],webSearchProvider:'disabled'});
 await platform.start();
 const outputDir=path.join(dataDir,'commercial-decisions');fs.mkdirSync(outputDir,{recursive:true,mode:0o700});
 const server=createReceiver({secret,modelTurn:async prompt=>{
  const conversation=await platform.createConversation(identity.id,'MeuLocal comercial '+new Date().toISOString());
  return platform.turn(conversation.id,prompt,AbortSignal.timeout(90000));
 },onDecision:async(decision,event)=>{
  const name=createHmac('sha256',secret).update(event.eventId).digest('hex')+'.json';
  const file=path.join(outputDir,name);
  if(fs.existsSync(file))return;
  fs.writeFileSync(file,JSON.stringify({decision,eventId:event.eventId,contactId:event.contactId||null,createdAt:new Date().toISOString()})+'\n',{mode:0o600,flag:'wx'});
 }});
 const port=Number(process.env.OPENDOTS_COMMERCIAL_PORT||8787);
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'0.0.0.0',resolve)});
 console.log(JSON.stringify({status:'READY',port,service:'opendots_commercial',dispatch:false}));
 const close=async()=>{server.close();await platform.stop();workspace.close();store.close()};
 process.once('SIGTERM',()=>{void close()});process.once('SIGINT',()=>{void close()});
}
export {createReceiver,sameSignature};
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename))start().catch(e=>{console.error(JSON.stringify({status:'BLOCKED',reason:e.message}));process.exitCode=1});
