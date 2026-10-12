export const MEULOCAL_GHL_WORKFLOWS = [
  'bb6f4a2b-46d7-4e23-9c99-176461551583',
  'f4500c60-e33d-41f5-a461-c146662e226e',
] as const;

export type WorkflowRemoval = {workflowId:string;eventStartTime:string};

/** Only explicitly verified memberships (one or two) may be removed; no inferred start time. */
export function validateWorkflowRemovals(input:unknown):WorkflowRemoval[] {
  if(!Array.isArray(input)||input.length<1||input.length>MEULOCAL_GHL_WORKFLOWS.length)throw new Error('workflow_enrollments_not_verified');
  const seen=new Set<string>();
  const result:WorkflowRemoval[]=[];
  for(const entry of input){
    if(!entry||typeof entry!=='object')throw new Error('invalid_workflow_enrollment');
    const value=entry as Record<string,unknown>;
    if(typeof value.workflowId!=='string'||!MEULOCAL_GHL_WORKFLOWS.includes(value.workflowId as typeof MEULOCAL_GHL_WORKFLOWS[number])||seen.has(value.workflowId))throw new Error('workflow_id_not_allowed');
    if(typeof value.eventStartTime!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value.eventStartTime)||!Number.isFinite(Date.parse(value.eventStartTime)))throw new Error('workflow_start_time_missing');
    seen.add(value.workflowId);result.push({workflowId:value.workflowId,eventStartTime:value.eventStartTime});
  }
  return result;
}

/** Side-effecting operation: only call after authorized membership and times are verified. */
export async function removeVerifiedWorkflowEnrollments(args:{token:string;contactId:string;removals:WorkflowRemoval[];fetchImpl?:typeof fetch}){
  const entries=validateWorkflowRemovals(args.removals);
  const request=args.fetchImpl??fetch;
  for(const {workflowId,eventStartTime} of entries){
    const response=await request('https://services.leadconnectorhq.com/contacts/'+encodeURIComponent(args.contactId)+'/workflow/'+workflowId,{
      method:'DELETE',headers:{Authorization:'Bearer '+args.token,Version:'v3','Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify({eventStartTime}),cache:'no-store'
    });
    if(!response.ok)throw new Error('ghl_workflow_remove_failed:'+workflowId+':'+response.status);
    const value=await response.json() as {succeeded?:boolean;succeded?:boolean};
    if(value.succeeded!==true&&value.succeded!==true)throw new Error('ghl_workflow_remove_unconfirmed:'+workflowId);
  }
}
