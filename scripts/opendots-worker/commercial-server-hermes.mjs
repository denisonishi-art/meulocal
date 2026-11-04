import fs from 'node:fs';
import path from 'node:path';
import {createReceiver} from './commercial-server.mjs';
import {createReceiptStore} from './commercial-receipts.mjs';
import {createHermesModelTurn} from './hermes-model-turn.mjs';
import {canDispatch,readContactForSend,contactBlocked,sendGhlResponse} from './ghl-dispatch.mjs';

/** Gated dispatch: sends the Hermes decision via GHL only when explicitly enabled.
 * Keeps the decision's status/requiresHumanReview contract intact so the receipt store
 * stays compatible; the dispatch outcome is recorded in a separate `dispatch` field. */
async function dispatchDecision(decision,event){
  if(!canDispatch())return decision;
  if(!['answer','follow_up'].includes(decision.action))return decision;
  if(!['whatsapp','email'].includes(decision.channel)||!decision.message.trim())return decision;
  const token=process.env.GHL_API_KEY;
  const locationId=process.env.GHL_LOCATION_ID;
  if(!locationId||!event.contactId)return {...decision,dispatch:{status:'skipped',reason:'missing_context'}};
  try{
    const contact=await readContactForSend({token,locationId,contactId:event.contactId});
    const blocked=contactBlocked(contact);
    if(blocked.blocked)return {...decision,dispatch:{status:'blocked',reason:blocked.reason}};
    const sent=await sendGhlResponse({token,contactId:event.contactId,channel:decision.channel,message:decision.message});
    return {...decision,dispatch:{status:'sent',messageId:sent.messageId,conversationId:sent.conversationId}};
  }catch(err){
    return {...decision,dispatch:{status:'error',error:String(err?.message||err).slice(0,160)}};
  }
}

async function start(){
  const secret=process.env.OPENDOTS_COMMERCIAL_SECRET;
  if(!secret||secret.length<24)throw Error('OPENDOTS_COMMERCIAL_SECRET_required');
  const root=path.resolve(import.meta.dirname,'../..');
  const dataDir=path.resolve(process.env.HERMES_COMMERCIAL_DATA_DIR||path.join(root,'.opendots/data/commercial-decisions'));
  fs.mkdirSync(dataDir,{recursive:true,mode:0o700});
  const receipts=createReceiptStore(dataDir,secret);
  const modelTurn=createHermesModelTurn({timeoutMs:Number(process.env.HERMES_MODEL_TIMEOUT_MS||120000)});
  const dispatch=canDispatch();
  const server=createReceiver({secret,receipts,modelTurn,onDecision:dispatchDecision});
  const port=Number(process.env.OPENDOTS_COMMERCIAL_PORT||8787);
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'0.0.0.0',resolve)});
  console.log(JSON.stringify({status:'READY',port,service:'hermes_commercial',dispatch,model:'hermes'}));
  const close=()=>{server.close()};
  process.once('SIGTERM',close);process.once('SIGINT',close);
}

export {createReceiver,dispatchDecision,createHermesModelTurn};
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename))start().catch(e=>{console.error(JSON.stringify({status:'BLOCKED',reason:e.message}));process.exitCode=1});
