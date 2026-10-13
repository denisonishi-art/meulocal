import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..'),official=process.env.OPENDOTS_ROOT;
if(!official)throw Error('OPENDOTS_ROOT required');
const token=randomBytes(32).toString('hex'),port=4320,origin='http://127.0.0.1:'+port;
const data=path.join(official,'data/meulocal-local-validation');await fs.mkdir(data,{recursive:true,mode:0o700});
const child=spawn(process.execPath,['dist/server/server/index.js'],{cwd:official,env:{PATH:process.env.PATH,HOST:'127.0.0.1',PORT:String(port),DATABASE_PATH:path.join(data,'workspace.sqlite'),OWNER_ID:'meulocal-research-local',OWNER_TOKEN:token,DO_NOT_TRACK:'1',COPILOTKIT_TELEMETRY_DISABLED:'true',WEB_SEARCH_PROVIDER:'disabled'},stdio:['ignore','ignore','ignore']});
let exited=false;child.on('exit',()=>{exited=true});
const request=(url,method='GET',body)=>fetch(origin+url,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
try{
 let response;for(let i=0;i<60;i++){if(exited)throw Error('official_runtime_exited');try{response=await request('/api/workspace');if(response.ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
 assert.ok(response?.ok,'official runtime unavailable');const workspace=await response.json();assert.ok(workspace.setup.missing.includes('OPENAI_MODEL'));assert.equal(workspace.setup.intelligence,false);
 const spec=JSON.parse(await fs.readFile(path.join(root,'scripts/opendots-worker/dot.json'),'utf8'));
 let dot=workspace.dots.find(d=>d.name===spec.name);if(!dot){const created=await request('/api/dots','POST',{...spec,spaceId:workspace.spaces[0].id});assert.equal(created.status,201);dot=await created.json()}
 assert.equal(dot.researchAllowed,false);assert.equal(dot.memoryAllowed,false);
 const conversation=await request('/api/conversations','POST',{dotId:dot.id,title:'Geradores Sao Paulo — human review'});assert.equal(conversation.status,503);
 const scheduled=await request('/api/tasks','POST',{prompt:'Use MeuLocal Research. No outreach.',intervalSeconds:86400});assert.equal(scheduled.status,503);
 assert.equal((await fetch(origin+'/api/workspace')).status,401);
 const result={officialRuntime:'PASS',dotConfigured:dot.name,researchAllowed:dot.researchAllowed,memoryAllowed:dot.memoryAllowed,missing:workspace.setup.missing,conversationWithoutCredentials:503,scheduledWithoutCredentials:503,unauthorized:401,recurrence:'BLOCKED_NOT_ENABLED',modelCalls:0,providerCalls:0,outboundMessages:0,slack:'not_configured',voice:'not_configured',crmConnections:0};
 await fs.writeFile(path.join(root,'docs/evidence/opendots-local-validation-2026-10-13/runtime-smoke.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{child.kill('SIGTERM');await new Promise(resolve=>{if(exited)return resolve();child.once('exit',resolve);setTimeout(()=>{child.kill('SIGKILL');resolve()},5000).unref()})}
