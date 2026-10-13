import {createHash} from 'node:crypto';
import {MEULOCAL_GHL_LOCATION_ID,MEULOCAL_GHL_WORKFLOWS} from '@/lib/ghl-workflow-removal';
import type {OptOutScope,OptOutStore} from '@/lib/rcia-opt-out-sync';
import type {SupabaseClient} from '@supabase/supabase-js';

// Preparation contract only. This tag has NOT been registered or bound in GHL.
const NATIVE_OPT_OUT_TAG='meulocal:opt-out-comercial';
type OptOutSource='ghl_webhook'|'ghl_poll'|'opendots'|'rcia';
type LocalOptOut=OptOutScope & {optOutAt:string};
export type NativeOptOutPlan=LocalOptOut & {
  source:OptOutSource;sourceEventRef:string;eventOrigin:'ghl'|'meulocal';
  correlationId:string;attemptId:string;auditRef:string;tag:string;preparedAt:string;
  targetWorkflowIds:string[];dispatchAllowed:false;
};

/** INTERNAL normalized evidence, not fields promised by the GHL API.
 * Only a trusted adapter may produce this from durable configuration/log evidence.
 * No route, tag or inbound callback is allowed to populate these contracts directly. */
export type NativeWorkflowBinding={
  locationId:string;blockingWorkflowId:string;evidenceRef:string;published:boolean;
  trigger:'contact_tag_added';tag:string;targetWorkflowIds:string[];removalScope:'specific_workflows';
};
export type NativeRemovalEvidence={
  source:'verified_native_adapter';evidenceRef:string;correlationMethod:'verified_execution_link';
  locationId:string;contactId:string;blockingWorkflowId:string;correlationId:string;attemptId:string;
  actions:{workflowId:string;executionId:string;actionLogId:string;succeeded:boolean;completedAt:string}[];
  absence:{complete:boolean;observedAt:string;workflows:{workflowId:string;activeExecutionIds:string[];evidenceRef:string}[]};
};

function validId(value:unknown):value is string{return typeof value==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(value)}
function reference(value:unknown):value is string{return typeof value==='string'&&/^[a-zA-Z][a-zA-Z0-9_-]*:[a-zA-Z0-9_:./-]{1,240}$/.test(value)}
function timestamp(value:unknown){
  return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)?Date.parse(value):NaN;
}
function sameTargets(ids:unknown):ids is string[]{
  return Array.isArray(ids)&&ids.length===2&&new Set(ids).size===2&&MEULOCAL_GHL_WORKFLOWS.every(id=>ids.includes(id));
}
function validScope(scope:OptOutScope){
  if(!scope||scope.locationId!==MEULOCAL_GHL_LOCATION_ID||!validId(scope.contactId)||!validId(scope.leadId))throw new Error('native_scope_unverified');
}

/** Reuses the existing serialized ledger and audit. Deliberately has no transport,
 * token lookup, environment switch or callback handler. Never marks synchronized.
 * readLocalOptOut must read the persisted scoped mapping, not echo request fields. */
export async function prepareNativeOptOut(args:{
  scope:OptOutScope;source:OptOutSource;sourceEventRef:string;intent:'opt_out';store:OptOutStore;
  readLocalOptOut:(scope:OptOutScope)=>Promise<LocalOptOut|null>;now?:()=>Date;
  // Optional LOCAL recorder, called while the acquired attempt is still in_progress.
  // It may only register an independently verified binding; never dispatch remotely.
  persistIntent?:(plan:NativeOptOutPlan)=>Promise<void>;
}):Promise<{synchronized:false;status:string;error:string;plan?:NativeOptOutPlan}>{
  validScope(args.scope);
  if(args.intent!=='opt_out'||!['ghl_webhook','ghl_poll','opendots','rcia'].includes(args.source)||!reference(args.sourceEventRef)||args.sourceEventRef.length>128)throw new Error('native_source_unverified');
  const local=await args.readLocalOptOut(args.scope);
  const at=timestamp(local?.optOutAt),now=(args.now??(()=>new Date()))().getTime();
  if(!local||!Number.isFinite(at)||!Number.isFinite(now)||at>now||local.locationId!==args.scope.locationId||local.contactId!==args.scope.contactId||local.leadId!==args.scope.leadId)throw new Error('native_local_opt_out_unverified');
  const claim=await args.store.claim(args.scope);
  // The shared ledger's old synchronized flag is not evidence of native execution.
  if(!claim.acquired)return {synchronized:false,status:claim.status,error:'native_existing_attempt_requires_reconciliation'};
  if(!validId(claim.attemptId))throw new Error('native_claim_invalid');
  if(claim.confirmed.length){
    await args.store.record(args.scope,claim.attemptId,{status:'blocked',confirmed:claim.confirmed,error:'native_strategy_conflict'});
    return {synchronized:false,status:'blocked',error:'native_strategy_conflict'};
  }
  // Stable across webhook/poll/RCIA duplicates; source is deliberately outside identity.
  const correlationId=createHash('sha256').update(JSON.stringify(['meulocal-native-opt-out-v1',args.scope.locationId,args.scope.contactId,args.scope.leadId,new Date(at).toISOString()])).digest('hex');
  const plan:NativeOptOutPlan={...args.scope,optOutAt:local.optOutAt,source:args.source,sourceEventRef:args.sourceEventRef,
    eventOrigin:args.source.startsWith('ghl_')?'ghl':'meulocal',correlationId,attemptId:claim.attemptId,
    auditRef:`native-optout:v1:${args.source}:${correlationId}:${args.sourceEventRef}`,tag:NATIVE_OPT_OUT_TAG,preparedAt:new Date(now).toISOString(),
    targetWorkflowIds:[...MEULOCAL_GHL_WORKFLOWS],dispatchAllowed:false};
  if(args.persistIntent)await args.persistIntent(plan);
  await args.store.record(args.scope,claim.attemptId,{status:'blocked',confirmed:[],evidenceRef:plan.auditRef,error:'native_dispatch_not_verified'});
  return {synchronized:false,status:'blocked',error:'native_dispatch_not_verified',plan};
}

/** Validates an independently captured proof; does not mutate the ledger or confer
 * dispatch authority. A future authenticated adapter/reconciliation gate is required. */
export function validateNativeRemovalEvidence(plan:NativeOptOutPlan,binding:NativeWorkflowBinding,input:unknown,now=new Date()):string{
  const fail=()=>{throw new Error('native_removal_not_verified')};
  validateNativeWorkflowBinding(plan,binding);
  const proof=input as NativeRemovalEvidence;
  if(!proof||proof.source!=='verified_native_adapter'||!reference(proof.evidenceRef)||proof.correlationMethod!=='verified_execution_link'||proof.locationId!==plan.locationId||proof.contactId!==plan.contactId||proof.blockingWorkflowId!==binding.blockingWorkflowId||proof.correlationId!==plan.correlationId||proof.attemptId!==plan.attemptId||!validId(plan.attemptId)||!Array.isArray(proof.actions)||!sameTargets(proof.actions.map(a=>a?.workflowId)))fail();
  const observed=timestamp(proof.absence?.observedAt),refused=timestamp(plan.optOutAt),prepared=timestamp(plan.preparedAt),age=now.getTime()-observed;
  if(!Number.isFinite(refused)||!Number.isFinite(prepared)||prepared<refused||!Number.isFinite(age)||age<0||age>60000||observed<prepared||proof.absence?.complete!==true||!Array.isArray(proof.absence?.workflows)||!sameTargets(proof.absence.workflows.map(w=>w?.workflowId)))fail();
  const logs=new Set<string>(),executions=new Set<string>();
  for(const action of proof.actions){
    const completed=timestamp(action.completedAt);
    if(action.succeeded!==true||!validId(action.executionId)||!validId(action.actionLogId)||logs.has(action.actionLogId)||!Number.isFinite(completed)||completed<prepared||completed>observed)fail();
    logs.add(action.actionLogId);executions.add(action.executionId);
  }
  // Both actions must belong to the same correlated blocking-workflow execution.
  if(executions.size!==1)fail();
  for(const workflow of proof.absence.workflows){
    if(!reference(workflow.evidenceRef)||!Array.isArray(workflow.activeExecutionIds)||workflow.activeExecutionIds.length!==0)fail();
  }
  return proof.evidenceRef;
}

function validateNativeWorkflowBinding(plan:NativeOptOutPlan,binding:NativeWorkflowBinding){
  validScope(plan);
  if(!binding||binding.locationId!==plan.locationId||!validId(binding.blockingWorkflowId)||!reference(binding.evidenceRef)||binding.published!==true||binding.trigger!=='contact_tag_added'||binding.tag!==NATIVE_OPT_OUT_TAG||binding.removalScope!=='specific_workflows'||!sameTargets(binding.targetWorkflowIds)||!sameTargets(plan.targetWorkflowIds)||plan.tag!==NATIVE_OPT_OUT_TAG||MEULOCAL_GHL_WORKFLOWS.some(id=>id===binding.blockingWorkflowId))throw new Error('native_removal_not_verified');
}

/** Internal service-only gate; no public ingress and no provider writes. */
export async function persistNativeOptOutIntent(db:SupabaseClient,plan:NativeOptOutPlan,binding:NativeWorkflowBinding){
  validateNativeWorkflowBinding(plan,binding);
  const {data,error}=await db.rpc('record_meulocal_native_opt_out_intent',{p_location_id:plan.locationId,p_contact_id:plan.contactId,p_lead_id:plan.leadId,p_attempt_id:plan.attemptId,p_plan:plan,p_binding:binding});
  if(error||data!==true)throw new Error('native_intent_persistence_failed');
}

/** A trusted evidence adapter or authorized operator supplies durable normalized proof.
 * A duplicated receipt does not establish a new observation of current remote absence. */
export async function reconcileNativeOptOutEvidence(db:SupabaseClient,args:{plan:NativeOptOutPlan;binding:NativeWorkflowBinding;evidence:unknown;expectedStatus:'uncertain'|'in_progress';now?:Date}){
  const evidenceRef=validateNativeRemovalEvidence(args.plan,args.binding,args.evidence,args.now);
  const {data,error}=await db.rpc('reconcile_meulocal_native_opt_out',{p_location_id:args.plan.locationId,p_contact_id:args.plan.contactId,p_lead_id:args.plan.leadId,p_attempt_id:args.plan.attemptId,p_expected_status:args.expectedStatus,p_evidence:args.evidence});
  if(error||!data||typeof data.recorded!=='boolean'||typeof data.duplicate!=='boolean'||data.recorded===data.duplicate)throw new Error('native_reconciliation_failed');
  return {synchronized:data.recorded===true,duplicate:data.duplicate,evidenceRef};
}
