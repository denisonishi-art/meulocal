/**
 * MeuLocal Prospector - deterministic, evidence-backed qualification.
 * This module NEVER sends messages or writes to CRM.
 * Discovery adapters must supply real sources. Missing data is not a negative signal.
 */
export type Signal = "few_reviews" | "low_rating" | "unanswered_reviews" | "website_issue" | "local_visibility_gap";
export type Evidence = { signal: Signal; url: string; observedAt: string; description: string; verified: boolean };
export type BusinessLead = {
  externalId: string;
  name: string;
  segment: string;
  city: string;
  state: string;
  website?: string;
  address?: string;
  evidence: Evidence[];
};
export type LeadAssessment = {
  lead: BusinessLead;
  score: number;
  priority: "alta" | "media" | "baixa" | "sem_evidencias";
  reasons: string[];
  approvalStatus: "pending_review";
  opportunityStatus: "needs_context" | "evidence_for_review";
};
const weights: Record<Signal, number> = {
  few_reviews: 30,
  low_rating: 20,
  unanswered_reviews: 15,
  website_issue: 10,
  local_visibility_gap: 25,
};
export function qualifyLead(lead: BusinessLead): LeadAssessment {
  const trusted = lead.evidence.filter(e => {
    if (!e.verified || !e.description.trim() || (!Number.isFinite(Date.parse(e.observedAt)) || Date.parse(e.observedAt)>Date.now())) return false;
    try { const u = new URL(e.url); return u.protocol === "https:" || u.protocol === "http:"; }
    catch { return false; }
  });
  const unique = [...new Map(trusted.map(e => [e.signal, e])).values()];
  const score = Math.min(100, unique.reduce((sum, e) => sum + weights[e.signal], 0));
  return {
    lead,
    score,
    priority: unique.length === 0 ? "sem_evidencias" : score >= 60 ? "alta" : score >= 30 ? "media" : "baixa",
    reasons: unique.map(e => e.description),
    approvalStatus: "pending_review",
    opportunityStatus: unique.some(e=>e.signal!=="few_reviews") ? "evidence_for_review" : "needs_context",
  };
}
export function rankLeads(leads: BusinessLead[]): LeadAssessment[] {
  const seen = new Set<string>();
  return leads.filter(lead => {
    const key = lead.externalId.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(qualifyLead).sort((a, b) => b.score - a.score || a.lead.name.localeCompare(b.lead.name));
}
export type ProspectingJob = {
  segment: BusinessLead["segment"];
  city: string;
  state: string;
  requestedLimit: number;
  mode: "research_only";
};
export function validateJob(input: ProspectingJob): ProspectingJob {
  if (typeof input.segment !== "string" || !input.segment.trim() || input.segment.length > 80) throw new Error("Segmento invalido");
  if (!input.city.trim() || !input.state.trim()) throw new Error("Localidade obrigatoria");
  if (!Number.isInteger(input.requestedLimit) || input.requestedLimit < 1 || input.requestedLimit > 50)
    throw new Error("Limite permitido: 1 a 50");
  if (input.mode !== "research_only") throw new Error("Envio comercial nao permitido por este agente");
  return input;
}
