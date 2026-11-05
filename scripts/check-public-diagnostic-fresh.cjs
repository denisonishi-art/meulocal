const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');

const file='app/d/[token]/page.tsx';
const source=fs.readFileSync(file,'utf8');
const adminRoute=fs.readFileSync('app/api/admin/prospects/prepare-report/route.ts','utf8');
const reportNames=[
 'Yázigi — Vila Clementino',
 'Wizard by Pearson Merces',
 'Inglês nos Trinx'
];
const diagnostic={
 id:'11111111-2222-4333-8444-555555555555',
 place_id:'ChIJexamplePlace1234',
 public_token:'6cd12285-b7c2-40b3-933a-c882e2077af5',
 business_name:'Wizard by Pearson Cursino',
 address:'Avenida do Cursino, 1284, São Paulo',
 score:16,rating:4,review_count:5
};
function snapshot(names){
 return {
  google_place_id:diagnostic.place_id,
  expires_at:new Date(Date.now()+24*3600*1000).toISOString(),
  observed_at:new Date().toISOString(),
  updated_at:new Date().toISOString(),
  snapshot:{
   version:'meulocal_top3_v2',radiusMeters:3000,
   observedAt:new Date().toISOString(),averageCompetitorReviews:156,reviewGap:151,
   business:{rating:4,reviewCount:5},
   competitors:names.map((name,i)=>({
    id:'ChIJ'+i+'place',name,
    address:'São Paulo, SP',rating:i===2?5:4.9,
    reviewCount:[196,182,91][i],distanceKm:[2.44,1.73,2.95][i]
   })),warnings:[],recommendations:['Ação 1','Ação 2','Ação 3']
  }
 };
}
function render(snapshotRow){
 const compiler=ts.transpileModule(source,{compilerOptions:{
  target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX
 },reportDiagnostics:true});
 assert.equal(compiler.diagnostics.filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);
 const module={exports:{}};
 let connectionOptions;
 const client={from(name){
  const chain={
   select(){return chain},
   eq(){return chain},
   async maybeSingle(){return {data:name==='prospect_diagnostics'?diagnostic:snapshotRow,error:null}}
  };
  return chain;
 }};
 const fakeFetch=async()=>new Response('ok',{status:200});
 const icon=()=>React.createElement('span',null);
 const map={
  'next/navigation':{notFound(){throw Error('not found')}},
  '@supabase/supabase-js':{createClient(url,key,opts){connectionOptions=opts;return client}},
  'lucide-react':{ArrowRight:icon,MapPin:icon,Star:icon,TrendingDown:icon},
  './diagnostic.css':{},
  './OpenTracker':{__esModule:true,default:()=>null},
  'react/jsx-runtime':require('react/jsx-runtime')
 };
 const oldUrl=process.env.NEXT_PUBLIC_SUPABASE_URL,oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://synthetic.supabase.invalid';
 process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic';
 try{
  new Function('module','exports','require','fetch',compiler.outputText)(module,module.exports,
   name=>name in map?map[name]:require(name),fakeFetch);
  return {page:module.exports.default,vars:module.exports,connectionOptions:()=>connectionOptions};
 }finally{
  if(oldUrl===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL=oldUrl;
  if(oldKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey;
 }
}
async function markup(row){
 const {page,vars,connectionOptions}=render(row);
 const prevUrl=process.env.NEXT_PUBLIC_SUPABASE_URL,prevKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://synthetic.supabase.invalid';
 process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic';
 try{
  const html=renderToStaticMarkup(await page({params:{token:diagnostic.public_token}}));
  return {html,vars,connectionOptions:connectionOptions()};
 }finally{
  if(prevUrl===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=prevUrl;
  if(prevKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=prevKey;
 }
}
test('public report renders three competitors from updated v2 snapshot, not a stored obsolete one',async()=>{
 const first=await markup(snapshot(['Cultura Inglesa Saúde']));
 assert.equal(first.html.includes('Cultura Inglesa Saúde'),true);
 assert.equal(first.html.includes('Yázigi — Vila Clementino'),false);
 const newest=await markup(snapshot(reportNames));
 for(const name of reportNames)assert.equal(newest.html.includes(name),true,name);
 assert.equal(newest.html.includes('Cultura Inglesa Saúde'),false);
 assert.match(newest.html,/Média dos concorrentes/);
 assert.match(newest.html,/156/);
 assert.equal(newest.vars.dynamic,'force-dynamic');
 assert.equal(newest.vars.revalidate,0);
 assert.equal(newest.vars.fetchCache,'force-no-store');
});
test('the Supabase client used by the public report explicitly bypasses server fetch cache',async()=>{
 const p=await markup(snapshot(reportNames));
 assert.equal(typeof p.connectionOptions.global.fetch,'function');
 assert.equal(p.connectionOptions.auth.persistSession,false);
 // Must be present in the implementation, even when the route is dynamically rendered.
 assert.match(source,/cache:'no-store'/);
});
test('admin report refresh invalidates the public page path only after persisted success',()=>{
 assert.match(adminRoute,/from 'next\/cache'/);
 const build=adminRoute.indexOf('await prepareVerifiedComparison');
 const invalidate=adminRoute.indexOf("revalidatePath('/d/'+diagnostic.public_token,'page')");
 assert.ok(build>0&&invalidate>build);
 assert.match(adminRoute,/dispatched:0,contactStarted:0/);
});