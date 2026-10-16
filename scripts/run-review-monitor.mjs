// Run hourly from the existing VPS scheduler. No secrets in arguments or logs.
const base=process.env.MEULOCAL_MONITOR_BASE_URL||'https://meulocal.ia.br';
if(new URL(base).origin!=='https://meulocal.ia.br'||!process.env.CRON_SECRET)throw Error('monitor_scheduler_configuration_required');
let failed=false;
for(let batch=0;batch<100;batch++){
 const response=await fetch(new URL('/api/cron/review-monitor',base),{headers:{Authorization:'Bearer '+process.env.CRON_SECRET},redirect:'error',signal:AbortSignal.timeout(65000)});
 const result=await response.json();
 if(response.status===200&&result.enabled===false){console.info(JSON.stringify({stage:'review_monitor_scheduler',enabled:false,action:'no_op'}));break}
 if(![200,503].includes(response.status)||result.enabled!==true)throw Error('monitor_unavailable_or_disabled');
 if(!result.ok)failed=true;
 if(!result.moreWork){if(failed)process.exitCode=1;break}
 if(batch===99)throw Error('monitor_batch_limit_reached');
}
