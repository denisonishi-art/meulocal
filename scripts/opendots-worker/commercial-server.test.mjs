import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createReceiver} from './commercial-server.mjs';
const secret='integration-secret-for-meulocal-2026-test';
const event={kind:'meulocal.acquisition.inbound',eventId:'evt-123456789',leadId:'lead1',contactId:'c1',message:'Como funciona?',channel:'email',permissions:{initialSend:false,autoReply:false,crmWrite:false}};
test('authenticated inbound -> official model adapter -> decision, no send; replay blocked',async()=>{
 let calls=0;const decisions=[];
 const server=createReceiver({secret,modelTurn:async()=>{calls++;return JSON.stringify({action:'answer',channel:'email',message:'Podemos explicar como funciona a gestão de avaliações.',rationale:'Pergunta comercial',requiresHumanReview:true})},onDecision:async d=>decisions.push(d)});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const base='http://127.0.0.1:'+server.address().port,body=JSON.stringify(event);
  const signature='sha256='+createHmac('sha256',secret).update(body).digest('hex');
  const opts={method:'POST',headers:{'Content-Type':'application/json','X-MeuLocal-Signature':signature},body};
  const response=await fetch(base+'/commercial/inbound',opts);assert.equal(response.status,200);
  assert.equal((await response.json()).status,'decision_saved');
  assert.equal(decisions[0].status,'suggestion_only');assert.equal(calls,1);
  const duplicate=await fetch(base+'/commercial/inbound',opts);assert.equal((await duplicate.json()).status,'duplicate');assert.equal(calls,1);
  const rejected=await fetch(base+'/commercial/inbound',{...opts,headers:{'X-MeuLocal-Signature':'sha256=bad'}});assert.equal(rejected.status,401);
 }finally{await new Promise(resolve=>server.close(resolve))}
});
