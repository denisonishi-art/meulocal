import { buildConsultativeApproach } from "../lib/agents/consultative-approach";

const assert = (condition: boolean, message: string) => { if (!condition) throw new Error(message); };
const sample = {
 businessName:"Geradores Exemplo", niche:"aluguel de geradores",region:"São Paulo",
 reviewCount:9,competitorAverageReviews:34,
 sourceUrl:"https://maps.google.com/?q=exemplo",sourceObservedAt:"2026-10-10T00:00:00Z",
};
const draft=buildConsultativeApproach(sample);
assert(draft.status==="ready_for_review","should prepare a review-only draft");
assert(Boolean(draft.email?.body.includes("9 avaliações")),"specific fact should be present");
assert(Boolean(draft.whatsapp?.includes("Posso compartilhar")),"permission-first CTA required");
assert(!draft.email?.body.includes("http"),"no unsolicited diagnostic link");
assert(buildConsultativeApproach({...sample,sourceUrl:null}).status==="needs_evidence","no copy without evidence");
assert(buildConsultativeApproach({...sample,reviewCount:null}).status==="needs_evidence","no invented count");
console.log("Approach checks passed");
