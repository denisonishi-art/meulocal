import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'../..');
const official=process.env.OPENDOTS_ROOT;if(!official)throw Error('OPENDOTS_ROOT required');
const require=createRequire(import.meta.url);
const {createMcpBridge}=require('./mcp-server.cjs');
const {WorkspaceStore}=await import(pathToFileURL(path.join(official,'dist/server/server/workspace.js')));
const {ConnectionService}=await import(pathToFileURL(path.join(official,'dist/server/server/connections.js')));
const sdk=createRequire(path.join(official,'package.json'));
const {Client}=sdk('@modelcontextprotocol/sdk/client/index.js');
const {StreamableHTTPClientTransport}=sdk('@modelcontextprotocol/sdk/client/streamableHttp.js');
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve('http://127.0.0.1:'+server.address().port)));
const close=server=>new Promise(resolve=>{server.closeAllConnections?.();server.close(resolve)});
test('official OpenDots discovers research tools and calls the real MeuLocal route over local HTTP',async()=>{
 const key=randomBytes(32).toString('hex'),token=randomBytes(32).toString('hex');const previous=process.env.MEULOCAL_PROSPECTOR_API_KEY;process.env.MEULOCAL_PROSPECTOR_API_KEY=key;
 const intelligence=require('./test-loader.cjs')()(path.join(root,'lib/agents/prospect-intelligence.ts'));
 const loader=require('./test-loader.cjs')({'@/lib/agents/prospect-intelligence':intelligence});
 const route=loader(path.join(root,'app/api/agents/prospecting/route.ts'));
 const endpointServer=http.createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;const reply=await route.POST(new Request('http://127.0.0.1/api/agents/prospecting',{method:'POST',headers:req.headers,body}));res.writeHead(reply.status,Object.fromEntries(reply.headers));res.end(await reply.text())});
 const endpoint=await listen(endpointServer);let sourceCalls=0;let bridge,workspace,client;
 try{
  const unauthorized=await fetch(endpoint+'/api/agents/prospecting',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(unauthorized.status,401);
  const realFetch=globalThis.fetch;
  bridge=createMcpBridge({openDotsRoot:official,repoRoot:root,endpoint:endpoint+'/api/agents/prospecting',apiKey:key,placesKey:'SYNTHETIC_PROVIDER_KEY',token,fetch:async(url,init)=>{
   if(url.startsWith('https://places.googleapis.com/')){sourceCalls++;return new Response(JSON.stringify({places:[{id:'SYNTHETIC_1',displayName:{text:'SYNTHETIC Geradores'},addressComponents:[{longText:'São Paulo',types:['locality']},{shortText:'SP',types:['administrative_area_level_1']}],businessStatus:'OPERATIONAL',userRatingCount:9,rating:4.6,googleMapsUri:'https://maps.google.com/?cid=SYNTHETIC_1'}]}),{status:200})}
   assert.ok(url.startsWith(endpoint+'/api/agents/prospecting'));return realFetch(url,init);
  }});
  const bridgeUrl=await listen(bridge);
  assert.equal((await realFetch(bridgeUrl+'/mcp',{method:'POST',body:'{}'})).status,401);
  workspace=new WorkspaceStore(':memory:','SYNTHETIC_OWNER');const dot=workspace.dots()[0];
  const connections=new ConnectionService(workspace.connections);
  const connection=await connections.add(dot.id,{name:'MeuLocal Research',url:bridgeUrl+'/mcp',token});
  assert.deepEqual(connection.tools.map(t=>t.name).sort(),['research_generator_prospects','research_readiness']);assert.ok(connection.tools.every(t=>t.readOnly&&t.enabled));
  client=new Client({name:'SYNTHETIC integration test',version:'1.0.0'});await client.connect(new StreamableHTTPClientTransport(new URL(bridgeUrl+'/mcp'),{requestInit:{headers:{Authorization:'Bearer '+token}}}));
  const response=await client.callTool({name:'research_generator_prospects',arguments:{limit:1}});assert.equal(response.isError,undefined);
  const result=JSON.parse(response.content[0].text);assert.equal(result.assessments[0].score,30);assert.equal(result.assessments[0].approvalStatus,'pending_review');assert.equal(result.drafts[0].draft.status,'ready_for_review');assert.equal(result.actions.crmWrite,false);assert.equal(sourceCalls,1);
  const missing=await client.callTool({name:'send_whatsapp',arguments:{}});assert.equal(missing.isError,true);
  assert.equal(JSON.stringify(response).includes(key),false);assert.equal(JSON.stringify(response).includes(token),false);
 }finally{await client?.close();workspace?.close();if(bridge)await close(bridge);await close(endpointServer);if(previous===undefined)delete process.env.MEULOCAL_PROSPECTOR_API_KEY;else process.env.MEULOCAL_PROSPECTOR_API_KEY=previous}
});
