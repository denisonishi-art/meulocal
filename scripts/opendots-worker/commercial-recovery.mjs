import {createHmac} from 'node:crypto';

const PATH='/api/internal/opendots/recover';
export function validateSupervisedRecovery({url,secret}={}){
 if(!url)return null;
 const target=new URL(url);
 if(target.protocol!=='https:'||target.hostname!=='meulocal.ia.br'||target.port||target.pathname!==PATH||target.username||target.password||target.search||target.hash)throw Error('invalid_recovery_endpoint');
 if(typeof secret!=='string'||secret.length<24)throw Error('recovery_secret_required');
 return target;
}
/** No queue lives here: database leases and saved receipts survive process restarts. */
export function startSupervisedRecovery({url,secret,fetchImpl=fetch,schedule=setTimeout,cancel=clearTimeout,log=value=>console.log(JSON.stringify(value))}={}){
 const target=validateSupervisedRecovery({url,secret});
 if(!target)return {enabled:false,stop(){}};
 let stopped=false,timer,controller;
 const tick=async()=>{
  if(stopped)return;
  controller=new AbortController();
  const deadline=setTimeout(()=>controller?.abort(),55000);
  let result={status:'recovery_pending',reason:'request_failed'};
  try{
   const body=JSON.stringify({version:1,timestamp:Date.now()});
   const signature='sha256='+createHmac('sha256',secret).update('POST\n'+PATH+'\n'+body).digest('hex');
   const response=await fetchImpl(target.href,{method:'POST',body,headers:{'Content-Type':'application/json','X-MeuLocal-Recovery-Signature':signature},redirect:'error',signal:controller.signal});
   const data=await response.json();
   const verified=response.ok&&data?.ok===true&&data.inbox?.ok===true&&data.payments?.ok===true&&data.queue?.ok===true;
   result={status:verified?'recovery_finished':'recovery_pending',httpStatus:response.status,ingested:Number(data?.inbox?.ingested)||0,completed:Number(data?.queue?.completed)||0,pending:Number(data?.queue?.pending)||0};
  }catch{/* Provider errors are private; the next tick retries durable work. */}
  finally{clearTimeout(deadline);controller=undefined;log({service:'opendots_supervised_recovery',...result});if(!stopped)timer=schedule(tick,60000)}
 };
 timer=schedule(tick,1000);
 return {enabled:true,stop(){stopped=true;cancel(timer);controller?.abort()}};
}
