const {test}=require('node:test');const assert=require('node:assert/strict');
const {classifyExternalFailure,cleanupOwnedResources}=require('./external-failures.cjs');
test('provider errors remain bounded and distinguish auth, routes, quota and unavailability',()=>{
 for(const [status,code] of [[401,'authentication_failed'],[403,'permission_or_location_denied'],[404,'route_or_resource_not_found'],[429,'rate_limited'],[502,'provider_unavailable']])assert.equal(classifyExternalFailure({status,message:'SYNTHETIC_SECRET'}),code);
 assert.equal(classifyExternalFailure({name:'TimeoutError'}),'timeout');
});
test('partial cleanup failure does not skip remaining owned resources or presume success',async()=>{
 const seen=[];const r=await cleanupOwnedResources([{name:'mcp',close:()=>{seen.push('mcp');throw Error('SYNTHETIC_SECRET')}},{name:'runtime',close:()=>seen.push('runtime')},{name:'lock',close:()=>seen.push('lock')}]);assert.deepEqual(seen,['mcp','runtime','lock']);assert.deepEqual(r,['mcp']);assert.doesNotMatch(JSON.stringify(r),/SYNTHETIC_SECRET/);
});
