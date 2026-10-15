/** Only persisted, bounded human guidance is exposed. Never authorizes execution. */
export type OpenDotsGuidance={message:string;rationale:string;requiresHumanReview:true;nextPath?:'/onboarding'|'/dashboard'};
export function readOpenDotsGuidance(value:unknown):OpenDotsGuidance|null{
 if(!value||typeof value!=='object')return null;
 const v=value as Record<string,unknown>;
 if(v.requiresHumanReview!==true||typeof v.message!=='string'||v.message.length>1800||typeof v.rationale!=='string'||v.rationale.length>1000)return null;
 if(v.nextPath!==undefined&&v.nextPath!=='/onboarding'&&v.nextPath!=='/dashboard')return null;
 return {message:v.message,rationale:v.rationale,requiresHumanReview:true,...(v.nextPath?{nextPath:v.nextPath as '/onboarding'|'/dashboard'}:{})};
}
