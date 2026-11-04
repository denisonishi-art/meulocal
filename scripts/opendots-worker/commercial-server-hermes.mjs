import fs from 'node:fs';
import path from 'node:path';
import {createReceiver} from './commercial-server.mjs';
import {createReceiptStore} from './commercial-receipts.mjs';
import {createDeepSeekModelTurn} from './deepseek-model-turn.mjs';
import {createDispatchLedger} from './dispatch-ledger.mjs';
import {canDispatch,readContactForSend,contactBlocked,sendGhlResponse,contactAllowedForDispatch,contactIsolatedForHermes,reconcileSentMessage} from './ghl-dispatch.mjs';

/** Build the gated dispatcher. Every layer must pass before a GHL send:
 * (1) global flag, (2) per-event autoReply, (3) contact allowlist, (4) DND/opt-out/channel
 * eligibility, (5) isolation tag. The send is recoverable + idempotent via a durable dispatch
 * ledger: the intent is persisted BEFORE the send, and an 'intent' left by a crash is
 * reconciled against GHL before any new attempt. */
export function createDispatcher(deps){
  const {
    canDispatch:can = canDispatch,
    contactAllowedForDispatch:allow = contactAllowedForDispatch,
    contactIsolatedForHermes:isolated = contactIsolatedForHermes,
    readContactForSend:readContact = readContactForSend,
    contactBlocked:blockedFn = contactBlocked,
    sendGhlResponse:send = sendGhlResponse,
    reconcileSentMessage:reconcile = reconcileSentMessage,
    ledger,
    token,
    locationId,
  } = deps;

  return async function dispatchDecision(decision,event){
    if(!can())return decision;
    if(event.permissions?.autoReply!==true)return decision;
    if(!['answer','follow_up'].includes(decision.action))return decision;
    if(!['whatsapp','email'].includes(decision.channel)||!decision.message.trim())return decision;
    if(!locationId||!event.contactId)return {...decision,dispatch:{status:'skipped',reason:'missing_context'}};
    if(!allow(event.contactId))return {...decision,dispatch:{status:'skipped',reason:'contact_not_in_e2e_allowlist'}};

    // Recoverable/idempotent: consult the durable dispatch ledger first.
    const existing = ledger ? ledger.read(event.eventId) : null;
    if(existing?.state==='sent'){
      return {...decision,dispatch:{status:'sent',messageId:existing.messageId,conversationId:existing.conversationId}};
    }
    if(existing?.state==='intent'){
      try{
        const rec = await reconcile({token,locationId,contactId:event.contactId,message:existing.message,since:existing.updatedAt});
        if(rec.found){
          ledger.markSent(event.eventId,{messageId:rec.messageId,conversationId:rec.conversationId});
          return {...decision,dispatch:{status:'sent',messageId:rec.messageId,conversationId:rec.conversationId}};
        }
        // not found → the previous send never landed → safe to (re)send below
      }catch(err){
        // reconciliation unavailable → outcome uncertain; do NOT re-send. Defer.
        return {...decision,dispatch:{status:'pending_reconciliation',error:String(err?.message||err).slice(0,120)}};
      }
    }

    try{
      const contact = await readContact({token,locationId,contactId:event.contactId});
      const blocked = blockedFn(contact, decision.channel);
      if(blocked.blocked)return {...decision,dispatch:{status:'blocked',reason:blocked.reason}};
      if(!isolated(contact))return {...decision,dispatch:{status:'skipped',reason:'contact_not_isolated_for_hermes'}};
      // Persist the intent BEFORE the send to close the crash window.
      if(ledger)ledger.recordIntent(event.eventId,{channel:decision.channel,contactId:event.contactId,message:decision.message});
      const sent = await send({token,contactId:event.contactId,channel:decision.channel,message:decision.message});
      if(ledger)ledger.markSent(event.eventId,{messageId:sent.messageId,conversationId:sent.conversationId});
      return {...decision,dispatch:{status:'sent',messageId:sent.messageId,conversationId:sent.conversationId}};
    }catch(err){
      if(ledger)ledger.markFailed(event.eventId,{error:String(err?.message||err).slice(0,160)});
      return {...decision,dispatch:{status:'error',error:String(err?.message||err).slice(0,160)}};
    }
  };
}

function allowlistState(){
  return (process.env.MEULOCAL_E2E_ALLOWED_CONTACTS||'').trim()?'set':'empty';
}

async function start(){
  const secret=process.env.OPENDOTS_COMMERCIAL_SECRET;
  if(!secret||secret.length<24)throw Error('OPENDOTS_COMMERCIAL_SECRET_required');
  const root=path.resolve(import.meta.dirname,'../..');
  const dataDir=path.resolve(process.env.HERMES_COMMERCIAL_DATA_DIR||path.join(root,'.opendots/data/commercial-decisions'));
  fs.mkdirSync(dataDir,{recursive:true,mode:0o700});
  const receipts=createReceiptStore(dataDir,secret);
  const ledger=createDispatchLedger(path.join(dataDir,'dispatch-ledger'),secret);
  const modelTurn=createDeepSeekModelTurn({
    apiKey:process.env.DEEPSEEK_API_KEY,
    baseUrl:process.env.DEEPSEEK_BASE_URL||'https://api.deepseek.com/v1',
    model:process.env.DEEPSEEK_MODEL||'deepseek-v4-pro',
    timeoutMs:Number(process.env.DEEPSEEK_MODEL_TIMEOUT_MS||90000),
    maxConcurrent:Number(process.env.DEEPSEEK_MODEL_MAX_CONCURRENT||2),
    maxTokens:Number(process.env.DEEPSEEK_MODEL_MAX_TOKENS||2000)
  });
  const token=process.env.GHL_API_KEY;
  const locationId=process.env.GHL_LOCATION_ID;
  const dispatcher=createDispatcher({ledger,token,locationId});
  const dispatch=canDispatch();
  const server=createReceiver({secret,receipts,modelTurn,onDecision:dispatcher,health:{status:'ready',runtime:'hermes',dispatch,allowlist:allowlistState(),model:'deepseek-direct'}});
  const port=Number(process.env.OPENDOTS_COMMERCIAL_PORT||8787);
  const bind=process.env.OPENDOTS_COMMERCIAL_BIND||'127.0.0.1';
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,bind,resolve)});
  console.log(JSON.stringify({status:'READY',port,bind,service:'hermes_commercial',dispatch,model:'deepseek-direct'}));
  const close=()=>{server.close()};
  process.once('SIGTERM',close);process.once('SIGINT',close);
}

export {createReceiver,createDeepSeekModelTurn};
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename))start().catch(e=>{console.error(JSON.stringify({status:'BLOCKED',reason:e.message}));process.exitCode=1});
