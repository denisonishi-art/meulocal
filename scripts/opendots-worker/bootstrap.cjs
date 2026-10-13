'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
if(process.versions.node!=='24.21.0')throw Error('Node_24_21_0_required');
const official=path.resolve(process.env.OPENDOTS_ROOT||path.join(__dirname,'../../.opendots/upstream'));
const revision='625452e06cde74cb25b0ce319e2c1be0488f5a5f';
const run=(cmd,args,cwd)=>cp.execFileSync(cmd,args,{cwd,stdio:'inherit'});
if(!fs.existsSync(official)){
 fs.mkdirSync(official,{recursive:true});run('git',['init'],official);run('git',['remote','add','origin','https://github.com/CopilotKit/OpenDots.git'],official);run('git',['fetch','--depth','1','origin',revision],official);run('git',['checkout','--detach','FETCH_HEAD'],official);
}
if(cp.execFileSync('git',['rev-parse','HEAD'],{cwd:official,encoding:'utf8'}).trim()!==revision)throw Error('existing_checkout_revision_mismatch');
const lock=fs.readFileSync(path.join(official,'package-lock.json'));if(crypto.createHash('sha256').update(lock).digest('hex')!=='5468cc68fc9ada584525047024515838977a4720a3a6d3f705ad29aa2564a123')throw Error('lockfile_mismatch');
if(!fs.existsSync(path.join(official,'node_modules')))run('npm',['ci','--ignore-scripts','--no-audit','--no-fund'],official);
if(!fs.existsSync(path.join(official,'dist/server/server/platform.js')))run('npm',['run','build'],official);
cp.execFileSync(process.execPath,[path.join(__dirname,'prepare-installation.cjs')],{cwd:path.resolve(__dirname,'../..'),env:{...process.env,OPENDOTS_ROOT:official},stdio:'inherit'});
