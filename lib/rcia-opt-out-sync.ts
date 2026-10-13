import type {SupabaseClient} from '@supabase/supabase-js';
import {MEULOCAL_GHL_LOCATION_ID,MEULOCAL_GHL_WORKFLOWS,removeVerifiedWorkflowEnrollments,validateWorkflowRemovals,type WorkflowRemoval} from '@/lib/ghl-workflow-removal';

export type OptOutScope = {locationId:string;contactId:string;leadId:string};
type SyncStatus = 'pending'|'in_progress'|'blocked'|'failed'|'uncertain'|'synchronized';
export type MembershipSnapshot = {
  locationId:string;contactId:string;source:'ghl_verified_adapter';evidenceRef:string;
  observedAt:string;checkedWorkflowIds:string[];memberships:WorkflowRemoval[];
};
type SyncRecord = {status:SyncStatus;confirmed:WorkflowRemoval[];evidenceRef?:string;error?:string};
export type OptOutStore = {
  claim(scope:OptOutScope):Promise<{acquired:boolean;status:SyncStatus;attemptId?:string;confirmed:WorkflowRemoval[];nativeIntent?:boolean}>;
  record(scope:OptOutScope,attemptId:string,record:SyncRecord):Promise<void>;
};

function verifiedSnapshot(input:MembershipSnapshot,scope:OptOutScope,now:Date){
  const age=now.getTime()-Date.parse(input?.observedAt);
  if(!input||input.source!=='ghl_verified_adapter'||!input.evidenceRef||input.evidenceRef.length>300||input.locationId!==scope.locationId||input.contactId!==scope.contactId||!Number.isFinite(age)||age<0||age>60000||!Array.isArray(input.checkedWorkflowIds)||input.checkedWorkflowIds.length!==MEULOCAL_GHL_WORKFLOWS.length||!MEULOCAL_GHL_WORKFLOWS.every(id=>input.checkedWorkflowIds.includes(id))||!Array.isArray(input.memberships))throw new Error('workflow_enrollments_not_verified');
  // An empty list is proof of absence ONLY from a complete, fresh, trusted lookup.
  return input.memberships.length===0?[]:validateWorkflowRemovals(input.memberships);
}

/** No real membership provider is wired until its API and provenance pass the release gate.
 * Never supply this dependency from inbound payloads, tags or environment JSON. */
export async function runOptOutSync(args:{
  scope:OptOutScope;store:OptOutStore;membershipProvider?:(scope:OptOutScope)=>Promise<MembershipSnapshot>;
  getToken:(locationId:string)=>Promise<string>;fetchImpl?:typeof fetch;now?:()=>Date;
}){
  const {scope,store}=args;
  if(scope.locationId!==MEULOCAL_GHL_LOCATION_ID)throw new Error('wrong_location');
  const claim=await store.claim(scope);
  if(claim.nativeIntent)return {synchronized:false,status:claim.status,error:'native_evidence_requires_reconciliation'};
  if(!claim.acquired)return {synchronized:claim.status==='synchronized',status:claim.status};
  const attemptId=claim.attemptId;
  if(!attemptId)throw new Error('sync_claim_invalid');
  const confirmed=[...claim.confirmed];
  let evidenceRef:string|undefined;
  let failureStatus:SyncStatus='blocked';
  let error='workflow_enrollments_not_verified';
  try{
    if(!args.membershipProvider)throw new Error(error);
    const snapshot=await args.membershipProvider(scope);
    const memberships=verifiedSnapshot(snapshot,scope,(args.now??(()=>new Date()))());
    evidenceRef=snapshot.evidenceRef;
    // A new run of a previously confirmed workflow must be reconciled, not replayed.
    if(memberships.some(m=>confirmed.some(c=>c.workflowId===m.workflowId&&c.eventStartTime!==m.eventStartTime)))throw new Error(error);
    const remaining=memberships.filter(m=>!confirmed.some(c=>c.workflowId===m.workflowId&&c.eventStartTime===m.eventStartTime));
    if(remaining.length){
      failureStatus='failed';error='ghl_credentials_unavailable';
      const token=await args.getToken(scope.locationId);
      for(const membership of remaining){
        // Persist intent before DELETE. A crash leaves in_progress for manual reconciliation.
        await store.record(scope,attemptId,{status:'in_progress',confirmed,evidenceRef});
        failureStatus='uncertain';error='ghl_removal_requires_reconciliation';
        await removeVerifiedWorkflowEnrollments({token,locationId:scope.locationId,contactId:scope.contactId,removals:[membership],fetchImpl:args.fetchImpl});
        confirmed.push(membership);
        await store.record(scope,attemptId,{status:'in_progress',confirmed,evidenceRef});
      }
    }
    await store.record(scope,attemptId,{status:'synchronized',confirmed,evidenceRef});
    return {synchronized:true,status:'synchronized' as const};
  }catch{
    // Raw provider exceptions may contain personal data or credentials; use bounded codes.
    await store.record(scope,attemptId,{status:failureStatus,confirmed,evidenceRef,error});
    return {synchronized:false,status:failureStatus,error};
  }
}

/** RPCs serialize claims across server instances and append audit events atomically. */
export function createOptOutStore(db:SupabaseClient):OptOutStore {
  return {
    async claim(scope){
      const {data,error}=await db.rpc('claim_meulocal_opt_out_sync',{p_location_id:scope.locationId,p_contact_id:scope.contactId,p_lead_id:scope.leadId});
      if(error||!data)throw new Error('sync_audit_unavailable');
      return data;
    },
    async record(scope,attemptId,record){
      const {data,error}=await db.rpc('record_meulocal_opt_out_sync',{p_location_id:scope.locationId,p_contact_id:scope.contactId,p_attempt_id:attemptId,p_status:record.status,p_confirmed:record.confirmed,p_evidence_ref:record.evidenceRef??null,p_error:record.error??null});
      if(error||data!==true)throw new Error('sync_audit_unavailable');
    }
  };
}
