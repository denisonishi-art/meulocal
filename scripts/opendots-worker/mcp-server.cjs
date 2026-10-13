'use strict';
const http=require('node:http');
const path=require('node:path');
const {createRequire}=require('node:module');
const {timingSafeEqual}=require('node:crypto');
function createMcpBridge({openDotsRoot,repoRoot,endpoint,approvedRemoteOrigin,apiKey,placesKey,sourceProvider,token,fetch,onResearchComplete}){
 if(!token||token.length<24)throw Error('mcp_token_required');
 const deps=createRequire(path.join(openDotsRoot,'package.json'));
 const {McpServer}=deps('@modelcontextprotocol/sdk/server/mcp.js');
 const {StreamableHTTPServerTransport}=deps('@modelcontextprotocol/sdk/server/streamableHttp.js');
 const {z}=deps('zod');
 const {createResearchWorker}=require('./adapter.cjs');
 const worker=createResearchWorker({repoRoot,sharedRoot:path.join(openDotsRoot,'meulocal-adapter/shared'),endpoint,approvedRemoteOrigin,apiKey,placesKey,sourceProvider},{fetch});
 const authorized=value=>{const supplied=Buffer.from(String(value||'').replace(/^Bearer /,'')),expected=Buffer.from(token);return supplied.length===expected.length&&timingSafeEqual(supplied,expected)};
 const server=http.createServer(async(req,res)=>{
  if(req.url!=='/mcp'){res.writeHead(404);return res.end()}
  if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)||req.headers.origin||!/^127\.0\.0\.1:\d+$/.test(req.headers.host||'')){res.writeHead(403);return res.end()}
  if(!authorized(req.headers.authorization)){res.writeHead(401);return res.end()}
  if(req.method!=='POST'){res.writeHead(405);return res.end()}
  let body='';try{for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>65536){res.writeHead(413);return res.end()}}body=JSON.parse(body)}catch{res.writeHead(400);return res.end()}
  const mcp=new McpServer({name:'meulocal-research-only',version:'1.0.0'});
  mcp.registerTool('research_readiness',{description:'Show missing configuration, without exposing keys or contacting providers.',inputSchema:{},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},async()=>({content:[{type:'text',text:JSON.stringify({privateEndpointConfigured:Boolean(apiKey),sourceConfigured:sourceProvider==='meulocal_backend'||Boolean(placesKey),crmWrite:false,outboundMessages:false,humanReviewRequired:true})}]}));
  mcp.registerTool('research_generator_prospects',{description:'Research rental generator businesses in Sao Paulo using Google Places, then qualify via MeuLocal. Returns at most 20 drafts for human review; never writes CRM or sends messages. One billable Google read per call; no automatic retries.',inputSchema:{limit:z.number().int().min(1).max(20).default(20)},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:false,openWorldHint:true}},async(args)=>{try{const result=await worker.research(args);onResearchComplete?.(result);return {content:[{type:'text',text:JSON.stringify(result)}]}}catch(e){const safe=/^(source_|qualification_|limit_|run_in_progress)/.test(e.message)?e.message:'research_failed';return {isError:true,content:[{type:'text',text:safe}]}}});
  const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  res.on('close',()=>{void transport.close();void mcp.close()});
  try{await mcp.connect(transport);await transport.handleRequest(req,res,body)}catch{if(!res.headersSent)res.writeHead(500);res.end()}
 });
 return server;
}
module.exports={createMcpBridge};
if(require.main===module){
 const config={openDotsRoot:process.env.OPENDOTS_ROOT,repoRoot:process.env.MEULOCAL_ROOT,endpoint:process.env.MEULOCAL_PROSPECTOR_ENDPOINT,apiKey:process.env.MEULOCAL_PROSPECTOR_API_KEY,placesKey:process.env.GOOGLE_PLACES_API_KEY,sourceProvider:process.env.MEULOCAL_SOURCE_PROVIDER,token:process.env.MEULOCAL_MCP_TOKEN};
 try{const server=createMcpBridge(config);server.listen(Number(process.env.MEULOCAL_MCP_PORT||4312),'127.0.0.1',()=>console.log('Research-only MCP listening on loopback. No dispatcher enabled.'));process.on('SIGTERM',()=>server.close())}catch{console.error('MCP setup incomplete. Check required local environment variables; credentials are never printed.');process.exitCode=1}
}
