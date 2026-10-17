import {decideDiagnosticNurture,type Snapshot,type Decision,type Stage} from './diagnostic-nurture';
/**
 * Read-only adapter. Caller MUST supply fresh, independently verified provider
 * state for every attempt. Missing state fails closed; this module never sends.
 */
export type Facts={
 lead:{id:string;business_id:string;email:string|null;whatsapp:string|null;
  consent_email:boolean;consent_whatsapp:boolean;opt_out_at:string|null;
  last_reply_at:string|null;ghl_contact_id:string|null;ghl_location_id:string|null;
  lifecycle_stage:string};
 business:{id:string;source:string;status:string};
 diagnostic:{id:string;business_id:string;created_at:string}|null;
 accountStatuses:string[];
 ledger:{stage:string;status:string}[];
 provider:{contactId:string;locationId:string;ownerVerified:boolean;emailDnd:boolean|null;
  whatsappDnd:boolean|null;emailOptOut:boolean|null;whatsappOptOut:boolean|null;
  stopAt:string|null;replyAt:string|null;checkedAt:string}|null;
 diagnosticDelivery:{confirmed:boolean;verifiedAt:string}|null;
};
const validStage=(v:string):v is Stage=>['d0','d1','d3','d5','d7'].includes(v);
export function decideFromVerifiedFacts(f:Facts,now:string):Decision{
 const lead=f.lead, business=f.business, provider=f.provider;
 const current=Date.parse(now);
 if(!Number.isFinite(current)||!lead||!business||lead.business_id!==business.id||
    !f.diagnostic||f.diagnostic.business_id!==business.id||
    business.source!=='inbound'||lead.lifecycle_stage==='lost'||business.status==='lost')
  return {status:'blocked',reason:'not_an_inbound_diagnostic'};
 if(!provider||!Number.isFinite(Date.parse(provider.checkedAt))||
    Date.parse(provider.checkedAt)>current||
    current-Date.parse(provider.checkedAt)>60000)
  return {status:'paused',reason:'provider_state_not_fresh'};
 if(!f.diagnosticDelivery?.confirmed||!Number.isFinite(Date.parse(f.diagnosticDelivery.verifiedAt))||
    Date.parse(f.diagnosticDelivery.verifiedAt)>current)
  return {status:'paused',reason:'diagnostic_delivery_not_verified'};
 if(f.ledger.some(x=>!validStage(x.stage)||!['sent','review_pending','approved','reserved','dispatching','uncertain','cancelled'].includes(x.status)))
  return {status:'blocked',reason:'unrecognized_ledger_state'};
 if(f.ledger.some(x=>!['sent','cancelled'].includes(x.status)))
  return {status:'paused',reason:'open_or_uncertain_delivery'};
 const payments=f.accountStatuses;
 const paymentStatus:Snapshot['paymentStatus']=payments.includes('active')?'active':
  payments.length===0?'none':payments.every(x=>x==='failed')?'failed':'unknown';
 const s:Snapshot={
  leadId:lead.id,businessId:business.id,diagnosticSavedAt:f.diagnostic.created_at,
  diagnosticDelivered:true,email:lead.email,whatsapp:lead.whatsapp,
  emailConsent:lead.consent_email,whatsappConsent:lead.consent_whatsapp,
  emailDnd:provider.emailDnd,whatsappDnd:provider.whatsappDnd,
  emailOptOut:provider.emailOptOut,whatsappOptOut:provider.whatsappOptOut,
  identityVerified:provider.contactId===lead.ghl_contact_id&&provider.locationId===lead.ghl_location_id,
  ownershipVerified:provider.ownerVerified,
  paymentStatus,repliedAt:lead.last_reply_at||provider.replyAt,
  stoppedAt:lead.opt_out_at||provider.stopAt,uncertainDelivery:false,
  sentStages:f.ledger.filter(x=>x.status==='sent').map(x=>x.stage as Stage)
 };
 if(lead.lifecycle_stage==='customer'||business.status==='customer')
  return {status:'blocked',reason:'already_customer'};
 return decideDiagnosticNurture(s,now);
}
