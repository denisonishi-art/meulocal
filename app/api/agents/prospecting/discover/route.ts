import { NextResponse } from "next/server";
import { rankLeads, type BusinessLead } from "@/lib/agents/prospect-intelligence";

export const runtime = "nodejs";
const segments = ["buffet infantil", "pizzaria", "escola infantil", "despachante", "academia", "aluguel de geradores"] as const;
type Place = { id?: string; displayName?: { text?: string }; formattedAddress?: string; userRatingCount?: number; rating?: number; websiteUri?: string };
/** Authenticated, bounded, read-only cloud discovery. Never creates CRM contacts or sends messages. */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (process.env.MEULOCAL_RESEARCH_ENABLED !== "true") return NextResponse.json({ status: "research_disabled", outboundMessages: false }, { status: 423 });
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return NextResponse.json({ error: "google_places_not_configured" }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const selected = typeof body.segment === "string" ? body.segment.trim().toLowerCase() : "";
  if (!segments.includes(selected as typeof segments[number])) return NextResponse.json({ error: "segment_not_allowed", allowedSegments: segments }, { status: 400 });
  const limit = Math.min(10, Math.max(1, Number.isInteger(body.limit) ? body.limit : 5));
  const query = `${selected} em São Paulo SP`;
  try {
    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.userRatingCount,places.rating,places.websiteUri" },
      body: JSON.stringify({ textQuery: query, regionCode: "BR", languageCode: "pt-BR", maxResultCount: limit }),
      cache: "no-store", signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) return NextResponse.json({ error: "google_places_failed", upstreamStatus: response.status }, { status: 502 });
    const data = await response.json() as { places?: Place[] };
    const observedAt = new Date().toISOString();
    const leads: BusinessLead[] = (data.places || []).filter(p => p.id && p.displayName?.text).map(p => {
      const count = typeof p.userRatingCount === "number" ? p.userRatingCount : null;
      const rating = typeof p.rating === "number" ? p.rating : null;
      const evidence: BusinessLead["evidence"] = [];
      const source = `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(p.id!)}`;
      if (count !== null && count < 30) evidence.push({ signal: "few_reviews", url: source, observedAt, description: `Google Places retornou ${count} avaliações; comparação competitiva ainda necessária`, verified: true });
      if (rating !== null && rating < 4) evidence.push({ signal: "low_rating", url: source, observedAt, description: `Google Places retornou nota ${rating}; contexto e comparação ainda necessários`, verified: true });
      return { externalId: `google:${p.id}`, name: p.displayName!.text!, segment: selected, city: "São Paulo", state: "SP", website: p.websiteUri, evidence };
    });
    return NextResponse.json({ mode: "research_only", source: "google_places", observedAt, query, assessed: rankLeads(leads), actions: { crmWrite: false, outboundMessages: false, humanReviewRequired: true }, caveat: "Os scores são sinais iniciais, não elegibilidade de contato. Ainda falta verificação de duplicidade, DND e opt-out no GHL." }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "research_unavailable" }, { status: 502 }); }
}
