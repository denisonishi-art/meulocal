const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript'),vm=require('vm');
const m={exports:{}};vm.runInNewContext('(function(module,exports){'+ts.transpileModule(fs.readFileSync('lib/google-review-store.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText+'\n})',{Date,Number,String,Map,Error,Array})(m,m.exports);
const {toStoredReview,storeGoogleReviews}=m.exports;
const review=(id,extra={})=>({name:'accounts/1/locations/2/reviews/'+id,reviewId:id,starRating:'TWO',comment:'  Demorou muito.  ',createTime:'2026-11-01T10:00:00Z',updateTime:'2026-11-02T10:00:00Z',reviewer:{displayName:'Pessoa Real',profilePhotoUrl:'https://x.example.invalid/p.jpg'},reviewReply:{comment:'Obrigado pelo retorno',updateTime:'2026-11-03T10:00:00Z'},...extra});
test('maps Google v4 reviews without reviewer personal data',()=>{
 const r=toStoredReview('b1',review('R1'),'2026-11-13T00:00:00.000Z');
 assert.equal(r.google_review_id,'R1');assert.equal(r.star_rating,2);assert.equal(r.comment,'Demorou muito.');assert.equal(r.reply_comment,'Obrigado pelo retorno');
 assert.equal(r.review_created_at,'2026-11-01T10:00:00.000Z');assert.equal(JSON.stringify(r).includes('Pessoa Real'),false);assert.equal(JSON.stringify(r).includes('profile'),false);
 const bare=toStoredReview('b1',{name:'accounts/1/locations/2/reviews/R9',starRating:'FIVE'},'t');assert.equal(bare.google_review_id,'R9');assert.equal(bare.comment,null);assert.equal(bare.reply_comment,null);
 assert.equal(toStoredReview('b1',{},'t'),null);assert.equal(toStoredReview('b1',{reviewId:'X',starRating:'STAR_RATING_UNSPECIFIED'},'t').star_rating,null);
});
function db(fail=false){const calls=[];return {calls,from:t=>({upsert:(rows,o)=>{calls.push({op:'upsert',rows,o});return Promise.resolve({error:fail?{}:null})},update:p=>{const q={f:[]};const api={eq:(k,v)=>{q.f.push(['eq',k,v]);return api},is:(k,v)=>{q.f.push(['is',k,v]);return api},lt:(k,v)=>{q.f.push(['lt',k,v]);return api},select:()=>{calls.push({op:'update',p,f:q.f});return Promise.resolve({data:[{google_review_id:'OLD'}],error:null})}};return api}})}}
test('upserts in chunks, dedupes and marks removed reviews only when the fetch is complete',async()=>{
 const d=db(),many=Array.from({length:250},(_,i)=>review('R'+i));
 const r=await storeGoogleReviews(d,'b1',[...many,review('R0')],{complete:true});
 assert.equal(r.stored,250);assert.equal(r.removed,1);
 const ups=d.calls.filter(c=>c.op==='upsert');assert.equal(ups.length,2);assert.equal(ups[0].rows.length,200);assert.equal(ups[0].o.onConflict,'business_id,google_review_id');
 const upd=d.calls.find(c=>c.op==='update');assert.ok(upd.f.some(([o,k,v])=>o==='eq'&&k==='business_id'&&v==='b1'));
 const d2=db();await storeGoogleReviews(d2,'b1',many,{complete:false});assert.equal(d2.calls.some(c=>c.op==='update'),false);
});
test('a database error surfaces a safe code',async()=>{await assert.rejects(storeGoogleReviews(db(true),'b1',[review('R1')],{complete:false}),/google_reviews_store_failed/)});
