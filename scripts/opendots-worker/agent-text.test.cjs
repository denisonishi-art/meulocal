const {test}=require('node:test');const assert=require('node:assert/strict');
test('captures official chunk and content text events, ignoring non-text events',()=>{
 const {textDelta}=require('./agent-text.cjs');
 assert.equal(textDelta({type:'TEXT_MESSAGE_CHUNK',delta:'real answer'}),'real answer');
 assert.equal(textDelta({type:'TEXT_MESSAGE_CONTENT',delta:'content'}),'content');
 assert.equal(textDelta({type:'TOOL_CALL_ARGS',delta:'secret arguments'}),'');
 assert.equal(textDelta({type:'TEXT_MESSAGE_CHUNK'}),'');
});
