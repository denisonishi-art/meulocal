#!/usr/bin/env node
/** Regenerates prospecting-instructions.generated.txt from the single approved TS source
 * (lib/agents/instructions.ts + contracts.ts + business-rules.ts), so the worker's inbound
 * reply prompt reuses the EXACT same approved commercial guardrails (evidence rules,
 * stop-on-reply/opt-out/conversion, max 3 outbound messages, competitive-scope rules) instead
 * of a second, drifting copy. Run this whenever lib/agents/instructions.ts changes.
 * Usage: node scripts/opendots-worker/build-prospecting-instructions.mjs
 */
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);

const root=path.resolve(import.meta.dirname,'../..');
const outDir=fs.mkdtempSync(path.join(os.tmpdir(),'meulocal-instr-build-'));
try{
  execFileSync('npx',['tsc','lib/agents/instructions.ts','lib/agents/contracts.ts','lib/agents/business-rules.ts',
    '--module','commonjs','--target','es2020','--outDir',outDir,'--rootDir','.','--skipLibCheck','--esModuleInterop'],
    {cwd:root,stdio:'inherit'});
  const mod=require(path.join(outDir,'lib/agents/instructions.js'));
  if(typeof mod.prospectingInstructions!=='string'||mod.prospectingInstructions.length<100)throw Error('prospectingInstructions_export_missing_or_too_short');
  const target=path.join(root,'scripts/opendots-worker/prospecting-instructions.generated.txt');
  const header='# GERADO AUTOMATICAMENTE por build-prospecting-instructions.mjs — NÃO editar manualmente.\n# Fonte: lib/agents/instructions.ts (prospectingInstructions) + contracts.ts + business-rules.ts\n\n';
  fs.writeFileSync(target,header+mod.prospectingInstructions);
  console.log('OK: '+target+' ('+mod.prospectingInstructions.length+' chars)');
}finally{
  fs.rmSync(outDir,{recursive:true,force:true});
}
