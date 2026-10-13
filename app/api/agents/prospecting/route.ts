import { NextResponse } from "next/server";
import { z } from "zod";
import { rankLeads, validateJob, type BusinessLead } from "@/lib/agents/prospect-intelligence";

export const runtime = "nodejs";
const jobSchema = z.object({
  segment: z.string().trim().min(2).max(80),
  city: z.string().min(2).max(100),
  state: z.string().min(2).max(30),
  requestedLimit: z.number().int().min(1).max(50),
  mode: z.literal("research_only"),
  leads: z.array(z.object({
    externalId: z.string().min(1),
    name: z.string().min(1),
    segment: z.string().trim().min(2).max(80),
    city: z.string().min(1),
    state: z.string().min(1),
    website: z.string().optional(),
    evidence: z.array(z.object({
      signal: z.enum(["few_reviews", "low_rating", "unanswered_reviews", "website_issue", "local_visibility_gap"]),
      url: z.string().url(),
      observedAt: z.string(),
      description: z.string().min(1),
      verified: z.boolean()
    })).max(15)
  })).max(50).default([])
});
/**
 * A private read-only qualification adapter for an external OpenDots discovery worker.
 * This endpoint does NOT browse the internet, initiate outreach or upsert GHL contacts.
 * API key must be configured on both ends; fail closed when absent.
 */
export async function POST(request: Request) {
  const expected = process.env.MEULOCAL_PROSPECTOR_API_KEY;
  const supplied = request.headers.get("x-prospector-api-key");
  if (!expected || !supplied || supplied !== expected)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let raw: unknown;
  try { raw = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = jobSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid prospecting payload" }, { status: 400 });
  const { leads, ...jobInput } = parsed.data;
  const job = validateJob(jobInput);
  const eligible = (leads as BusinessLead[])
    .filter(lead => lead.segment.trim().toLowerCase() === job.segment.trim().toLowerCase() && lead.city.toLowerCase() === job.city.toLowerCase() && lead.state.toLowerCase() === job.state.toLowerCase())
    .slice(0, job.requestedLimit);
  return NextResponse.json({
    mode: "research_only",
    job,
    assessments: rankLeads(eligible),
    actions: { crmWrite: false, outboundMessages: false, humanReviewRequired: true },
    warning: "Evidencias fornecidas por integrador externo, nao verificadas pelo servidor."
  }, { headers: { "Cache-Control": "no-store" } });
}
