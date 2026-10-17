/** Pure, fail-closed decision engine. No transport, cron or enrollment side effects. */
export type Stage='d0'|'d1'|'d3'|'d5'|'d7';
export type Channel='email'|'whatsapp';
export type Snapshot={
 businessId:string; leadId:string; diagnosticSavedAt:string; diagnosticDelivered:boolean;
 email:string|null; whatsapp:string|null; emailConsent:boolean; whatsappConsent:boolean;
 emailDnd:boolean|null; whatsappDnd:boolean|null; emailOptOut:boolean|null; whatsappOptOut:boolean|null;
 identityVerified:boolean; ownershipVerified:boolean;
 paymentStatus:'none'|'failed'|'pending'|'processing'|'active'|'unknown';
 repliedAt:string|null; stoppedAt:string|null; uncertainDelivery:boolean;
 sentStages:Stage[];
};
export type Decision={status:'blocked'|'paused';reason:string}|{status:'review_required';stage:Stage;channel:Channel;idempotencyKey:string};
const steps:ReadonlyArray<{stage:Stage;afterHours:number;channel:Channel}>=[
 {stage:'d0',afterHours:0,channel:'email'},
 {stage:'d1',afterHours:24,channel:'email'},
 {stage:'d3',afterHours:72,channel:'whatsapp'},
 {stage:'d5',afterHours:120,channel:'email'},
 {stage:'d7',afterHours:168,channel:'email'}
];
export function decideDiagnosticNurture(s:Snapshot,now:string):Decision{
 const t=Date.parse(now),start=Date.parse(s.diagnosticSavedAt);
 if(!s.businessId||!s.leadId||!Number.isFinite(t)||!Number.isFinite(start)||t<start)
  return {status:'blocked',reason:'invalid_context'};
 if(!s.identityVerified||!s.ownershipVerified)return {status:'blocked',reason:'identity_unverified'};
 if(s.paymentStatus==='active')return {status:'blocked',reason:'already_paid'};
 if(s.paymentStatus!=='none'&&s.paymentStatus!=='failed')return {status:'paused',reason:'payment_unverified_or_pending'};
 if(s.stoppedAt)return {status:'blocked',reason:'opt_out'};
 if(s.repliedAt)return {status:'paused',reason:'reply_requires_human'};
 if(s.uncertainDelivery)return {status:'paused',reason:'delivery_uncertain'};
 if(!s.diagnosticDelivered)return {status:'paused',reason:'diagnostic_not_delivered'};
 if(new Set(s.sentStages).size!==s.sentStages.length)return {status:'blocked',reason:'duplicate_history'};
 const expected:Stage[]=['d0','d1','d3','d5','d7'];
 if(s.sentStages.some((stage,i)=>stage!==expected[i]))
  return {status:'blocked',reason:'out_of_order_history'};
 for(const step of steps){
  if(s.sentStages.includes(step.stage))continue;
  if(t-start<step.afterHours*3600000)return {status:'paused',reason:'not_due'};
  const authorized=step.channel==='email'
   ?Boolean(s.email&&s.emailConsent&&s.emailDnd===false&&s.emailOptOut===false)
   :Boolean(s.whatsapp&&s.whatsappConsent&&s.whatsappDnd===false&&s.whatsappOptOut===false);
  if(!authorized)return {status:'paused',reason:step.channel+'_not_authorized'};
  return {status:'review_required',stage:step.stage,channel:step.channel,
   idempotencyKey:'diagnostic-nurture:'+s.businessId+':'+s.leadId+':'+step.stage};
 }
 return {status:'blocked',reason:'sequence_complete'};
}
