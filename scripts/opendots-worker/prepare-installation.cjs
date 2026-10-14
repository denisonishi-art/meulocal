'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const upstream='625452e06cde74cb25b0ce319e2c1be0488f5a5f';
const official=process.env.OPENDOTS_ROOT;if(!official)throw Error('OPENDOTS_ROOT required');
const actual=cp.execFileSync('git',['-C',official,'rev-parse','HEAD'],{encoding:'utf8'}).trim();if(actual!==upstream)throw Error('upstream_revision_mismatch');
const source=__dirname,target=path.join(official,'meulocal-adapter');fs.mkdirSync(target,{recursive:true});
for(const name of ['adapter.cjs','mcp-server.cjs','dot.json'])fs.copyFileSync(path.join(source,name),path.join(target,name));
// Compile only the two existing pure MeuLocal modules, never application routes.
const root=path.resolve(__dirname,'../..'),ts=require(path.join(root,'node_modules/typescript'));
const shared=path.join(target,'shared');fs.mkdirSync(shared,{recursive:true});
const sharedHashes={};for(const name of ['prospect-intelligence','consultative-approach']){const file=path.join(root,'lib/agents',name+'.ts'),text=fs.readFileSync(file,'utf8');sharedHashes[name]=crypto.createHash('sha256').update(text).digest('hex');fs.writeFileSync(path.join(shared,name+'.cjs'),ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)}
const lock=fs.readFileSync(path.join(official,'package-lock.json'));
if(crypto.createHash('sha256').update(lock).digest('hex')!=='5468cc68fc9ada584525047024515838977a4720a3a6d3f705ad29aa2564a123')throw Error('upstream_lockfile_mismatch');
const record={repository:'https://github.com/CopilotKit/OpenDots',version:'0.1.0',commit:actual,node:process.versions.node,lockfileSha256:crypto.createHash('sha256').update(lock).digest('hex'),license:'MIT',path:official,localDirectory:true,sharedModuleSourceSha256:sharedHashes,typescript:ts.version,servicesActivated:false};
fs.writeFileSync(path.join(target,'installation.json'),JSON.stringify(record,null,2)+'\n');
if(process.env.OPENDOTS_INSTALLATION_REPORT)fs.writeFileSync(process.env.OPENDOTS_INSTALLATION_REPORT,JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({commit:actual,lockfileSha256:record.lockfileSha256,sharedModuleSourceSha256:sharedHashes}));
