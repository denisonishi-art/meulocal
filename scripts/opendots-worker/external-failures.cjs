'use strict';
function classifyExternalFailure(error){
 if(['TimeoutError','AbortError'].includes(error?.name))return 'timeout';
 const status=Number(error?.status||String(error?.message||'').match(/\b(401|403|404|429|5\d\d)\b/)?.[1]);
 return status===401?'authentication_failed':status===403?'permission_or_location_denied':status===404?'route_or_resource_not_found':status===429?'rate_limited':status>=500?'provider_unavailable':'transport_or_contract_failure';
}
async function cleanupOwnedResources(resources){const failed=[];for(const resource of resources)try{await resource.close()}catch{failed.push(resource.name)}return failed}
module.exports={classifyExternalFailure,cleanupOwnedResources};
