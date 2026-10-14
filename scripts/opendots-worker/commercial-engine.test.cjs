'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {decideCommercialEvent,validateEvent}=require('./commercial-engine.cjs');
const event={version:1,kind:'meulocal.acquisition.inbound',eventId:'evt-123456789',leadId:'lead-1',contactId:'contact-1',message:'Como funciona?',channel:'email',permissions:{initialSend:false,autoReply:false,crmWrite:false}};
test('interprets inbound email as a reviewable decision without dispatch',async()=>{
 const result=await decideCommercialEvent(event,{modelTurn:async()=>JSON.stringify({action:'answer',channel:'email',message:'A MeuLocal ajuda a organizar pedidos de avaliações.',rationale:'Perguntou sobre funcionamento',requiresHumanReview:true})});
 assert.equal(result.status,'suggestion_only');assert.equal(result.action,'answer');assert.equal(result.requiresHumanReview,true);
});
test('opt-out is deterministic and never calls model',async()=>{
 const result=await decideCommercialEvent({...event,message:'SAIR'},{modelTurn:async()=>{throw Error('must not run')}});
 assert.equal(result.action,'stop');assert.equal(result.message,'');
});
test('drafts must be email-first',async()=>{
 const draft={kind:'meulocal.acquisition.draft',eventId:'evt-123456789',prospect:{name:'Empresa X'},permissions:{initialSend:false,autoReply:false,crmWrite:false}};
 await assert.rejects(()=>decideCommercialEvent(draft,{modelTurn:async()=>JSON.stringify({action:'answer',channel:'whatsapp',message:'Oi',rationale:'teste',requiresHumanReview:true})}),/first_contact_email_only/);
});
test('rejects model decisions that request automatic sending',async()=>{
 await assert.rejects(()=>decideCommercialEvent(event,{modelTurn:async()=>JSON.stringify({action:'answer',channel:'email',message:'Oi',rationale:'teste',requiresHumanReview:false})}),/model_contract_invalid/);
 assert.throws(()=>validateEvent({...event,permissions:{autoReply:true}}),/external_side_effects_forbidden/);
});
