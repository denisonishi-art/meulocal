import { NextResponse } from "next/server";
import { z } from "zod";
import { rankLeads, validateJob, type BusinessLead } from "@/lib/agents/prospect-intelligence";

import {researchAuthorized,researchRateLimit,boundedResearchJson} from '@/lib/agents/research-security';
import {createClient} from '@supabase/supabase-js';
import {assessProspectEligibility} from '@/lib/agents/prospect-eligibility';
export const runtime = "nodejs";
export const maxDuration=60;
const jobSchema = z.object({
  segment: z.string().trim().min(2).max(80),
  city: z.string().min(2).max(100),
  state: z.string().min(2).max(30),
  requestedLimit: z.number().int().min(1).max(50),
  mode: z.literal("research_only"),
  leads: z.array(z.object({
    externalId: z.string().min(1).max(200),
    name: z.string().min(1).max(200),
    segment: z.string().trim().min(2).max(80),
    city: z.string().min(1),
    state: z.string().min(1),
    website: z.string().url().max(2000).optional(),
    address: z.string().max(500).optional(),
    evidence: z.array(z.object({
      signal: z.enum(["few_reviews", "low_rating", "unanswered_reviews", "website_issue", "local_visibility_gap"]),
      url: z.string().url().max(2000),
      observedAt: z.string().datetime({offset:true}).refine(value=>Date.parse(value)<=Date.now()),
      description: z.string().min(1).max(1500),
      verified: z.boolean()
    }).strict()).max(15)
  }).strict()).max(50).default([])
}).strict();
/**
 * A private read-only qualification adapter for an external OpenDots discovery worker.
 * This endpoint does NOT browse the internet, initiate outreach or upsert GHL contacts.
 * API key must be configured on both ends; fail closed when absent.
 */
export async function POST(request: Request) {
  if (!researchAuthorized(request))return NextResponse.json({error:'Unauthorized'},{status:401});
  const rate=await researchRateLimit(request,'prospector_qualification');
  if(rate.mode!=='enforced')return NextResponse.json({error:'rate_limit_unavailable'},{status:503});
  if(!rate.allowed)return NextResponse.json({error:'rate_limited'},{status:429,headers:{'Retry-After':'60'}});
  let raw:unknown;try{raw=await boundedResearchJson(request)}catch(error){return NextResponse.json({error:'invalid_payload'},{status:error instanceof Error&&error.message==='payload_too_large'?413:400})}
  const parsed = jobSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid prospecting payload" }, { status: 400 });
  const { leads, ...jobInput } = parsed.data;
  const job = validateJob(jobInput);
  const eligible = (leads as BusinessLead[])
    .filter(lead => lead.segment.trim().toLowerCase() === job.segment.trim().toLowerCase() && lead.city.toLowerCase() === job.city.toLowerCase() && lead.state.toLowerCase() === job.state.toLowerCase())
    .slice(0, job.requestedLimit);
  const locationId=process.env.GHL_LOCATION_ID;
  const enabled=process.env.MEULOCAL_RESEARCH_ELIGIBILITY_ENABLED==='true';
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const db=enabled&&url&&key?createClient(url,key,{auth:{persistSession:false}}):undefined;
  const eligibility=[];
  for(const [index,lead] of eligible.entries())eligibility.push(index<5?await assessProspectEligibility({lead,locationId:locationId||'',db,token:enabled?process.env.GHL_API_KEY:undefined}):{externalId:lead.externalId,status:'NOT_VERIFIED',contactAllowed:false,reasons:['history_read_batch_budget_exhausted']});
  return NextResponse.json({
    eligibility,
    mode: "research_only",
    job,
    assessments: rankLeads(eligible),
    actions: { crmWrite: false, outboundMessages: false, humanReviewRequired: true },
    warning: "Evidencias fornecidas por integrador externo, nao verificadas pelo servidor."
  }, { headers: { "Cache-Control": "no-store" } });
}
