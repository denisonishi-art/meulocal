import {getLocationAccessToken,createOperationalOpportunity} from '@/lib/highlevel-operational';

// Pipeline/stage defaults verified against the live HighLevel API for the MeuLocal
// location. "Vendas MeuLocal" already existed, so it is reused (no new pipeline).
// Stage "Novo lead" = "Prospect aprovado" — the opportunity starts here, only after
// explicit approval in MeuLocal (the sync runs inside send-manual after bind).
export const DEFAULT_PIPELINE_ID='GeQnDT0zT4wQfojd7VFo';
export const DEFAULT_PIPELINE_STAGE_ID='aeef9f4e-894d-4ea9-80b7-22b442fbfce5';

export function operationalOpportunityConfig(){
 const pipelineId=process.env.GHL_PIPELINE_ID||DEFAULT_PIPELINE_ID;
 const pipelineStageId=process.env.GHL_PIPELINE_STAGE_ID||DEFAULT_PIPELINE_STAGE_ID;
 return {pipelineId,pipelineStageId};
}

/** Link a GHL contact to an opportunity in the configured pipeline, deduplicated by
 * contact. Best-effort and inert until GHL_OPPORTUNITY_SYNC_ENABLED=true; a failed or
 * skipped opportunity never blocks the primary contact/send path. */
export async function syncOperationalOpportunity(args:{locationId:string;contactId:string;name:string;timeoutMs?:number}){
 if(process.env.GHL_OPPORTUNITY_SYNC_ENABLED!=='true')return {skipped:true as const,reason:'opportunity_sync_disabled'};
 try{
  const token=await getLocationAccessToken(args.locationId,args.timeoutMs);
  const {pipelineId,pipelineStageId}=operationalOpportunityConfig();
  const opportunity=await createOperationalOpportunity({token,locationId:args.locationId,contactId:args.contactId,name:args.name,pipelineId,pipelineStageId,timeoutMs:args.timeoutMs});
  return {skipped:false as const,opportunityId:opportunity.id,created:opportunity.created};
 }catch(error:any){
  return {skipped:false as const,error:String(error?.message||error).slice(0,200)};
 }
}
