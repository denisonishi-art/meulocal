import fs from 'node:fs';import path from 'node:path';import {DatabaseSync} from 'node:sqlite';
const instructions=JSON.parse(fs.readFileSync(new URL('./dot.json',import.meta.url),'utf8'));
// Import configuration, never sessions/history. Schema matches the pinned upstream.
export function bootstrapWorkspace(WorkspaceStore,file,ownerId,identity){
 if(!fs.existsSync(file)){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const db=new DatabaseSync(file);
  try{db.exec('BEGIN; CREATE TABLE spaces(id TEXT PRIMARY KEY,name TEXT NOT NULL,description TEXT NOT NULL,createdAt INTEGER NOT NULL); CREATE TABLE dots(id TEXT PRIMARY KEY,spaceId TEXT NOT NULL,name TEXT NOT NULL,instructions TEXT NOT NULL,researchAllowed INTEGER NOT NULL,memoryAllowed INTEGER NOT NULL,createdAt INTEGER NOT NULL);');
   db.prepare('INSERT INTO spaces VALUES(?,?,?,?)').run(identity.spaceId,'MeuLocal Research','Existing research configuration',Date.now());
   db.prepare('INSERT INTO dots VALUES(?,?,?,?,?,?,?)').run(identity.id,identity.spaceId,identity.name,instructions.instructions,0,0,Date.now());db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error}finally{db.close()}
  fs.chmodSync(file,0o600);
 }
 const workspace=new WorkspaceStore(file,ownerId);const dots=workspace.dots();
 if(dots.length!==1||dots[0].id!==identity.id||dots[0].name!==identity.name||dots[0].spaceId!==identity.spaceId||dots[0].researchAllowed||dots[0].memoryAllowed||dots[0].skillDeliveryEnabled){workspace.close();throw Error('existing_agent_identity_or_permissions_mismatch')}
 return workspace;
}
