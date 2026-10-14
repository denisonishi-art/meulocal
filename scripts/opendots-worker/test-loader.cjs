const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
module.exports=function loader(stubs={}){
 stubs={'@/lib/rate-limit':{consumeRateLimit:async()=>({allowed:true,mode:'enforced'})},...stubs};
 const cache=new Map();
 function load(file){
  const resolved=path.resolve(file);
  if(cache.has(resolved))return cache.get(resolved).exports;
  const m={exports:{}};cache.set(resolved,m);
  const js=ts.transpileModule(fs.readFileSync(resolved,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const req=name=>Object.hasOwn(stubs,name)?stubs[name]:name.startsWith('@/')?load(name.slice(2)+'.ts'):name.startsWith('.')?load(path.resolve(path.dirname(resolved),name)+'.ts'):require(name);
  new Function('module','exports','require',js)(m,m.exports,req);
  return m.exports;
 }
 return load;
};
