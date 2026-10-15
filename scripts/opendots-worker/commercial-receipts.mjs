import fs from 'node:fs';
import path from 'node:path';
import {createHmac,createHash,randomUUID} from 'node:crypto';
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
export function createReceiptStore(directory,secret){
 fs.mkdirSync(directory,{recursive:true,mode:0o700});
 const fingerprint=event=>createHash('sha256').update(JSON.stringify(canonical(event))).digest('hex');
 const fileFor=event=>path.join(directory,createHmac('sha256',secret).update(event.eventId).digest('hex')+'.json');
 const read=event=>{
  let saved;try{saved=JSON.parse(fs.readFileSync(fileFor(event),'utf8'))}catch(error){if(error.code==='ENOENT')return null;throw error}
  if(saved.eventId!==event.eventId||saved.fingerprint!==fingerprint(event))throw Error('saved_event_payload_conflict');
  if(saved.decision?.eventId!==event.eventId||saved.decision?.requiresHumanReview!==true||!['answer','follow_up','handoff','stop'].includes(saved.decision?.action)||saved.decision?.status!=='suggestion_only')throw Error('saved_receipt_invalid');
  return {status:'decision_saved',eventId:saved.eventId,action:saved.decision.action,dispatched:0};
 };
 const save=(decision,event)=>{
  const target=fileFor(event),temporary=target+'.'+randomUUID()+'.tmp';
  const record={decision,eventId:event.eventId,contactId:event.contactId||null,businessId:event.businessId||null,accountId:event.accountId||null,fingerprint:fingerprint(event),event,createdAt:new Date().toISOString()};
  try{
   const fd=fs.openSync(temporary,'wx',0o600);
   try{fs.writeFileSync(fd,JSON.stringify(record)+'\n');fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
   try{fs.linkSync(temporary,target)}catch(error){if(error.code!=='EEXIST')throw error}
   const dir=fs.openSync(directory,'r');try{fs.fsyncSync(dir)}finally{fs.closeSync(dir)}
  }finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary)}
  return read(event);
 };
 return {read,save,fingerprint};
}
