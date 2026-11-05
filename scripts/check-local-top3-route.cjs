const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');

function load(file,dependencies,globals={}){
 const content=fs.readFileSync(file,'utf8');
 const js=ts.transpileModule(content,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m={exports:{}};
 vm.runInNewContext('(function(require,module,exports){'+js+'\n})',{URL,Request,Response,AbortSignal,console,process:{env:{GOOGLE_PLACES_API_KEY:'synthetic'}},...globals})(
  name=>dependencies[name]||require(name),m,m.exports);
 return m.exports;
}
const competitorHelper=load('lib/competitors/top-local-reputation.ts',{});
const common={
 'next/server':{NextResponse:{json:(body,options={})=>Response.json(body,options)}},
 '@/lib/rate-limit':{consumeRateLimit:async()=>({allowed:true})},
 '@/lib/competitors/top-local-reputation':competitorHelper
};
const business={id:'target',name:'Escola Exemplo',category:'school',latitude:-23.6,longitude:-46.6,rating:4,reviewCount:5,website:null};
const p=(id,rating,reviews,lat=-23.6,type='school')=>({
 id,displayName:{text:id},rating,userRatingCount:reviews,
 location:{latitude:lat,longitude:-46.6},primaryType:type,types:[type],businessStatus:'OPERATIONAL'
});
function route(places){
 const calls=[];
 const api=load('app/api/places/analyze/route.ts',common,{fetch:async(url,options)=>{
  calls.push({url,options});
  return {ok:true,json:async()=>({places})};
 }});
 return {calls,analyze:(input=business)=>api.POST(new Request('https://synthetic.invalid/api/places/analyze',{method:'POST',body:JSON.stringify(input)}))};
}

test('diagnostic restricts candidates to 3 km and returns 3 strongest valid same-category profiles',async()=>{
 const f=route([
  p('target',5,500),p('outside',5,500,-23.64),
  p('different_category',5,500,-23.6,'restaurant'),
  p('one_review',5,1),
  p('strongest',4.8,400),p('second',4.7,300),p('third',4.6,180),p('fourth',4.5,100)
 ]);
 const response=await f.analyze();
 assert.equal(response.status,200);
 const data=await response.json();
 assert.equal(f.calls.length,1);
 assert.match(f.calls[0].url,/places:searchNearby$/);
 const payload=JSON.parse(f.calls[0].options.body);
 assert.equal(payload.locationRestriction.circle.radius,3000);
 assert.deepEqual(Array.from(payload.includedTypes),['school']);
 assert.equal(payload.maxResultCount,20);
 assert.ok(f.calls[0].options.headers['X-Goog-FieldMask'].includes('places.location'));
 assert.deepEqual(data.competitors.map(p=>p.id),['strongest','second','third']);
 assert.equal(data.competition.selection,'top_3_volume_adjusted_rating');
 assert.equal(data.competition.radiusMeters,3000);
 assert.ok(data.competitors.every(p=>p.distanceKm<=3));
});

test('missing coordinate or category is blocked without a broader search or inferred competitor',async()=>{
 const f=route([p('valid',4.8,300)]);
 const response=await f.analyze({...business,latitude:null});
 assert.equal(response.status,422);
 const noCategory=await f.analyze({...business,category:null});
 assert.equal(noCategory.status,422);
 assert.equal(f.calls.length,0);
});

test('if only one competitor qualifies, comparison stays unproven and warning is shown',async()=>{
 const f=route([p('target',5,900),p('only_one',4.8,100),p('invalid',5,0)]);
 const data=await (await f.analyze()).json();
 assert.equal(data.competitors.length,1);
 assert.equal(data.metrics.avgCompetitorReviews,null);
 assert.equal(data.metrics.reviewComparisonReliable,false);
 assert.ok(data.dataQuality.warnings.some(x=>x.includes('apenas 1')));
});
