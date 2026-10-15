// Runs the actual page handlers. Only browser hooks and external Auth/HTTP are isolated.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
function fixture({step=2,status=503,networkFailure=false,initial=false,canStart=true,onboardingStatus='pending'}={}){
 const states=[],effects=[],calls=[];let cursor=0;
 const react=require('react');
 const hooks={...react,useState(value){const i=cursor++;if(!(i in states))states[i]=i===0?step:i===2?true:i===8?initial:value;return [states[i],next=>{states[i]=typeof next==='function'?next(states[i]):next}]},useEffect(fn){if(initial&&effects.length===0)effects.push(fn)}};
 const source=ts.transpileModule(fs.readFileSync(path.join(root,'app/onboarding/page.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const module={exports:{}};const window={location:{href:'https://synthetic.invalid/onboarding',search:''}};
 const fetcher=async(url,options)=>{calls.push({url,options});if(networkFailure)throw Error('synthetic_network_failure');return Response.json(url==='/api/onboarding/status'&&options?.method!=='POST'?{canStartOnboarding:canStart,onboarding_status:onboardingStatus}:{error:'Falha sintética de persistência'},{status})};
 const req=n=>{if(n==='react')return hooks;if(n==='react/jsx-runtime')return require(n);if(n==='lucide-react')return new Proxy({},{get:()=>()=>null});if(n==='@supabase/supabase-js')return {createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'SYNTHETIC-token'}}})}})};if(n==='./CustomerBaseSetup')return {default:()=>null};throw Error('unexpected_import:'+n)};
 vm.runInNewContext('(function(require,module,exports,process,fetch,window){'+source+'\n})',{URLSearchParams,console})(req,module,module.exports,{env:{NEXT_PUBLIC_SUPABASE_URL:'https://synthetic.invalid',NEXT_PUBLIC_SUPABASE_ANON_KEY:'SYNTHETIC-anon'}},fetcher,window);
 function render(){cursor=0;return module.exports.default()}
 function nodes(element){if(!element)return [];if(Array.isArray(element))return element.flatMap(nodes);if(typeof element!=='object')return [];return [element,...nodes(element.props?.children)]}
 function text(element){if(element==null||typeof element==='boolean')return '';if(Array.isArray(element))return element.map(text).join(' ');if(typeof element==='object')return text(element.props?.children);return String(element)}
 function button(label){const n=nodes(render()).find(x=>x.type==='button'&&text(x).includes(label));assert.ok(n,'button_not_found:'+label);return n.props.onClick}
 return {render,button,text,states,calls,async mount(){render();effects[0]();await new Promise(resolve=>setImmediate(resolve));return render()}};
}
test('completion refuses a failed persistence and keeps the retry action',async()=>{
 const f=fixture();await f.button('Concluir configuração')();const page=f.render();assert.equal(f.states[0],2);assert.ok(f.text(page).includes('Concluir configuração'));assert.ok(!f.text(page).includes('Configuração concluída.'));assert.ok(f.text(page).includes('Falha sintética de persistência'));
});
test('skip refuses a failed persistence and does not claim a saved optional skip',async()=>{
 const f=fixture();await f.button('Fazer isso depois')();assert.equal(f.states[0],2);assert.equal(f.states[1],false);assert.ok(!f.text(f.render()).includes('Configuração concluída.'));
});
test('a confirmed saved completion reaches the existing dashboard link',async()=>{
 const f=fixture({status:200});await f.button('Concluir configuração')();assert.equal(f.states[0],3);assert.ok(f.text(f.render()).includes('Configuração concluída.'));assert.equal(f.calls[0].url,'/api/onboarding/status');assert.equal(JSON.parse(f.calls[0].options.body).status,'completed');
});
test('failed access lookup cannot present payment confirmed',async()=>{
 const f=fixture({initial:true,step:0});const page=await f.mount();assert.ok(!f.text(page).includes('Pagamento confirmado'));assert.ok(f.text(page).includes('Não foi possível verificar seu acesso'));
});
test('network failure during completion is visible and never completes',async()=>{
 const f=fixture({networkFailure:true});await f.button('Concluir configuração')();assert.equal(f.states[0],2);assert.ok(f.text(f.render()).includes('Não foi possível salvar'));assert.ok(!f.text(f.render()).includes('Configuração concluída.'));
});
test('confirmed pending payment remains blocked in the existing access gate',async()=>{
 const f=fixture({initial:true,step:0,status:200,canStart:false});const page=await f.mount();assert.ok(f.text(page).includes('Aguardando confirmação do pagamento'));assert.ok(!f.text(page).includes('Pagamento confirmado'));
});
test('Google can be deferred without claiming a connection',async()=>{
 const f=fixture({step:1,status:200});await f.button('Fazer isso depois')();assert.equal(f.states[0],2);assert.equal(f.states[4],false);
});
test('completion without OAuth does not claim Google or automation active',async()=>{
 const f=fixture({status:200});await f.button('Concluir configuração')();const text=f.text(f.render());assert.ok(!text.includes('Seu Google está conectado'));assert.ok(!text.includes('sua automação está configurada'));assert.ok(text.includes('Configuração concluída.'));
});
test('reloading completed onboarding does not infer a disconnected Google from initial UI state',async()=>{
 const f=fixture({initial:true,step:0,status:200,onboardingStatus:'completed'});const text=f.text(await f.mount());assert.ok(text.includes('Configuração concluída.'));assert.ok(!text.includes('novas avaliações não serão sincronizadas'));assert.ok(!text.includes('A primeira sincronização do Google foi concluída.'));
});
