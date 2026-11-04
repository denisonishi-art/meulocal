import {getLocationAccessToken,createOperationalOpportunity} from '@/lib/highlevel-operational';

// Pipeline/stage defaults match the existing GoHighLevel pipeline for the MeuLocal
// location. Override via env once the commercial pipeline/stage names are confirmed.
export const DEFAULT_PIPELINE_ID='O7n2zR5RFaTeBkGrmww6';
export const DEFAULT_PIPELINE_STAGE_ID='f66aaa3e-9fb8-4f35-ab00-26b7ae4aaa9c';

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
