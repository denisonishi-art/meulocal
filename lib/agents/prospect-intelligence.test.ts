import { describe, expect, it } from "vitest";
import { qualifyLead, rankLeads, validateJob, type BusinessLead } from "./prospect-intelligence";
const base: BusinessLead = { externalId: "g:1", name: "Empresa A", segment: "geradores", city: "Sao Paulo", state: "SP", evidence: [] };
describe("MeuLocal Prospector", () => {
  it("does not fabricate opportunity without evidence", () => {
    expect(qualifyLead(base)).toMatchObject({ score: 0, priority: "sem_evidencias", approvalStatus: "pending_review" });
  });
  it("ignores unverified source claims", () => {
    expect(qualifyLead({ ...base, evidence: [{ signal: "few_reviews", url: "https://example.com", observedAt: "2026-10-12", description: "unverified", verified: false }] }).score).toBe(0);
  });
  it("deduplicates lead identifiers and signals", () => {
    const evidence = { signal: "few_reviews" as const, url: "https://example.com", observedAt: "2026-10-12", description: "Observed count", verified: true };
    expect(rankLeads([{ ...base, evidence: [evidence, evidence] }, base])).toHaveLength(1);
    expect(qualifyLead({ ...base, evidence: [evidence, evidence] }).score).toBe(30);
  });
  it("refuses outbound mode", () => {
    expect(() => validateJob({ segment: "geradores", city: "Sao Paulo", state: "SP", requestedLimit: 10, mode: "send" as "research_only" })).toThrow();
  });
});
