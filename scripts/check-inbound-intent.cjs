// Deterministic smoke tests for inbound reply classification; no network or CRM writes.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const ts=require('typescript');
const source=fs.readFileSync('lib/agents/inbound-intent.ts','utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const m={exports:{}};
new Function('module','exports',js)(m,m.exports);
const classify=m.exports.classifyInboundIntent;
for(const value of ['SAIR','stop','Não tenho interesse','nao me contate',' cancelar ']){
 assert.equal(classify(value),'opt_out',value);
}
for(const value of ['Quero ver a análise','quero receber a analise','Pode enviar','Tenho interesse']){
 assert.equal(classify(value),'interested',value);
}
for(const value of ['Quanto custa?','Olá','A análise pode ser enviada amanhã?']){
 assert.equal(classify(value),'other',value);
}
console.log('Inbound intent classification checks passed');
