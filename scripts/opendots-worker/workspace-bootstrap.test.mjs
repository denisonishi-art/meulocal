import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';
test('portable bootstrap imports the existing Dot identity only, no credentials or authenticated history',async()=>{
 const {bootstrapWorkspace}=await import('./workspace-bootstrap.mjs');
 const {WorkspaceStore}=await import(pathToFileURL(path.join(process.env.OPENDOTS_ROOT,'dist/server/server/workspace.js')));
 const definition=JSON.parse(fs.readFileSync(new URL('./dot-identity.json',import.meta.url)));
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'opendots-portable-'));const file=path.join(dir,'workspace.sqlite');let workspace;
 try{workspace=bootstrapWorkspace(WorkspaceStore,file,'SYNTHETIC_OWNER',definition);assert.equal(workspace.dots().length,1);assert.equal(workspace.dots()[0].id,definition.id);assert.equal(workspace.dots()[0].researchAllowed,false);assert.equal(workspace.dots()[0].memoryAllowed,false);assert.equal(workspace.conversations().length,0);assert.equal(workspace.connections.list(definition.id).length,0);workspace.close();workspace=undefined;
  assert.throws(()=>bootstrapWorkspace(WorkspaceStore,file,'SYNTHETIC_OWNER',{...definition,id:'wrong-id'}),/identity/);
  workspace=bootstrapWorkspace(WorkspaceStore,file,'SYNTHETIC_OWNER',definition);assert.equal(workspace.dots()[0].id,definition.id);
 }finally{workspace?.close();fs.rmSync(dir,{recursive:true,force:true})}
});
