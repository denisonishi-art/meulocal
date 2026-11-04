import fs from 'node:fs';
import path from 'node:path';
import {createHmac,randomUUID} from 'node:crypto';

/** Durable dispatch ledger, keyed by eventId. Closes the crash window between a GHL
 * send being accepted and the decision receipt being persisted: the intent is written
 * to disk BEFORE the send, so a crash leaves either an 'intent' (uncertain — must
 * reconcile before retrying) or a 'sent'/'failed' record. Written atomically (temp +
 * rename + fsync), same durability pattern as the receipt store. */
export function createDispatchLedger(directory,secret){
  if(!secret||secret.length<24)throw Error('ledger_secret_required');
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const fileFor=eventId=>path.join(directory,createHmac('sha256',secret).update(eventId).digest('hex')+'.json');
  const read=eventId=>{
    let rec;
    try{rec=JSON.parse(fs.readFileSync(fileFor(eventId),'utf8'))}catch(error){if(error.code==='ENOENT')return null;throw error}
    if(rec.eventId!==eventId)throw Error('ledger_event_id_mismatch');
    return rec;
  };
  const write=(eventId,record)=>{
    const target=fileFor(eventId),temporary=target+'.'+randomUUID()+'.tmp';
    const data={eventId,...record,updatedAt:new Date().toISOString()};
    try{
      const fd=fs.openSync(temporary,'wx',0o600);
      try{fs.writeFileSync(fd,JSON.stringify(data)+'\n');fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
      fs.renameSync(temporary,target);
      const dir=fs.openSync(directory,'r');try{fs.fsyncSync(dir)}finally{fs.closeSync(dir)}
    }finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary)}
    return data;
  };
  return {
    read,
    recordIntent:(eventId,intent)=>write(eventId,{state:'intent',...intent}),
    markSent:(eventId,outcome)=>write(eventId,{state:'sent',...outcome}),
    markFailed:(eventId,outcome)=>write(eventId,{state:'failed',...outcome}),
    fileFor,
  };
}
