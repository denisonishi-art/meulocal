const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const vm=require('node:vm');

const source=fs.readFileSync('lib/competitors/top-local-reputation.ts','utf8');
const module={exports:{}};
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext('(function(module,exports){'+js+'\n})',{console})(module,module.exports);
const {selectTopLocalCompetitors,distanceMeters,weightedReputationRating,LOCAL_COMPETITOR_RADIUS_METERS}=module.exports;
const center={latitude:-23.6000,longitude:-46.6000};
const p=(id,rating,counts,lat=-23.6000,category='school')=>({
 id,displayName:{text:id},location:{latitude:lat,longitude:-46.6},primaryType:category,
 types:[category],rating,userRatingCount:counts,businessStatus:'OPERATIONAL'
});

test('radius is a hard 3 km limit and correct geographic distance is used',()=>{
 assert.equal(LOCAL_COMPETITOR_RADIUS_METERS,3000);
 assert.ok(distanceMeters(center,{latitude:-23.627,longitude:-46.6})>3000);
 assert.ok(distanceMeters(center,{latitude:-23.626,longitude:-46.6})<3000);
 const found=selectTopLocalCompetitors({businessId:'target',center,businessCategory:'school',places:[
  p('target',5,1000),
  p('within',4.8,500,-23.626),
  p('outside',5,1500,-23.630)
 ]});
 assert.deepEqual(found.map(x=>x.id),['within']);
 assert.ok(found[0].distanceKm<3);
});

test('three strongest credible profiles are selected by rating adjusted for review volume',()=>{
 const found=selectTopLocalCompetitors({businessId:'target',center,businessCategory:'school',places:[
  p('five_review',5,5),p('high_confidence',4.8,400),
  p('second',4.7,300),p('third',4.6,200),p('fourth',4.5,120),
  p('five_one',5,1),p('different_segment',5,900,-23.6,'gym'),
  p('outside',5,900,-23.635)
 ]});
 assert.deepEqual(found.map(x=>x.id),['high_confidence','second','third']);
 assert.ok(weightedReputationRating(4.8,400)>weightedReputationRating(5,5));
 assert.ok(found.every(x=>x.reviewDataReliable===true&&x.distanceKm<=3));
});

test('incomplete, duplicates and irrelevant profiles do not fabricate a third competitor',()=>{
 const invalid=p('missing_rating',undefined,999);
 const noLocation={...p('missing_location',4.8,200),location:undefined};
 const closed={...p('closed',5,999),businessStatus:'CLOSED_PERMANENTLY'};
 const found=selectTopLocalCompetitors({businessId:'target',center,businessCategory:'school',places:[
  p('legitimate',4.8,60),p('legitimate',4.8,60),invalid,noLocation,closed,
  p('unrated',null,100),p('different',4.8,200,-23.6,'restaurant')
 ]});
 assert.deepEqual(found.map(x=>x.id),['legitimate']);
 assert.ok(!found.some(x=>x.name.includes('missing')));
});

test('missing/invalid location is never treated as permission to broaden radius',()=>{
 const candidates=[p('valid',4.8,100)];
 assert.deepEqual(selectTopLocalCompetitors({businessId:'target',center:{latitude:null,longitude:-46.6},businessCategory:'school',places:candidates}),[]);
 assert.deepEqual(selectTopLocalCompetitors({businessId:'target',center:{latitude:91,longitude:-46.6},businessCategory:'school',places:candidates}),[]);
});
