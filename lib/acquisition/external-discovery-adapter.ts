/**
 * Read-only adapter for candidate records obtained from a permitted external source.
 * Does not fetch Google Maps, persist data, select prospects or send messages.
 * Daily limit is based on America/Sao_Paulo calendar days.
 */
export const DISCOVERY_DAILY_LIMIT = 10;
export type ExternalCandidate = {
  place_id?: string; google_place_id?: string; name?: string;
  title?: string; address?: string; complete_address?: string;
  website?: string; web_site?: string; phone?: string;
  phone_number?: string; rating?: number | string;
  reviews?: number | string; reviews_count?: number | string;
  email?: string; maps_url?: string; link?: string;
};
export type DiscoveryCandidate = {
  id: string; name: string; address: string; website: string | null;
  phone: string | null; rating: number | null; reviews: number | null;
  source: "external_import"; sourceUrl: string | null;
  approvalStatus: "pending_review"; contactStarted: false;
};
const clean = (v: unknown) => typeof v === "string" ? v.trim() : "";
function finiteNumber(v: unknown, min: number, max: number): number | null {
  if (v === "" || v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}
export function saoPauloDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(now);
}
/**
 * Caller must provide authoritative count of candidates already admitted
 * for this Sao Paulo day (from persistent storage). Never trust a client count.
 */
export function normalizeExternalCandidates(
  records: ExternalCandidate[], alreadyAdmittedToday: number
): { candidates: DiscoveryCandidate[]; skipped: number; remaining: number } {
  if (!Array.isArray(records)) throw new Error("Registros invalidos");
  if (!Number.isSafeInteger(alreadyAdmittedToday) || alreadyAdmittedToday < 0)
    throw new Error("Contagem diaria invalida");
  const remaining = Math.max(0, DISCOVERY_DAILY_LIMIT - alreadyAdmittedToday);
  const seen = new Set<string>();
  const candidates: DiscoveryCandidate[] = [];
  for (const row of records) {
    if (!row || typeof row !== "object") continue;
    const name = clean(row.name || row.title);
    const address = clean(row.address || row.complete_address);
    const id = clean(row.place_id || row.google_place_id);
    const sourceUrl = clean(row.maps_url || row.link);
    if (!name || !address || (!id && !sourceUrl)) continue;
    const key = (id || sourceUrl).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (candidates.length >= remaining) continue;
    candidates.push({
      id: id || sourceUrl, name, address,
      website: clean(row.website || row.web_site) || null,
      phone: clean(row.phone || row.phone_number) || null,
      rating: finiteNumber(row.rating, 0, 5),
      reviews: finiteNumber(row.reviews ?? row.reviews_count, 0, Number.MAX_SAFE_INTEGER),
      source: "external_import", sourceUrl: sourceUrl || null,
      approvalStatus: "pending_review", contactStarted: false
    });
  }
  return { candidates, skipped: records.length - candidates.length, remaining: Math.max(0, remaining - candidates.length) };
}
