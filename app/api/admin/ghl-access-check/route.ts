import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";


/** Read-only scope probe. No PII, token values, contact writes or workflow changes. */
export async function GET(request: Request) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const locationId = "uNh3KsM7WFuLeTN8Q583";
  if (process.env.GHL_LOCATION_ID && process.env.GHL_LOCATION_ID !== locationId)
    return NextResponse.json({ error: "location_mismatch" }, { status: 409 });
  const token=process.env.GHL_API_KEY;
  if(!token)return NextResponse.json({error:'private_integration_token_unavailable'},{status:503});
  // Read-only probes must never exchange an agency token through POST.

  const base = "https://services.leadconnectorhq.com";
  const checks = [
    { resource: "contacts", scope: "contacts.readonly", path: "/contacts/?locationId=" + encodeURIComponent(locationId) + "&limit=1", version: "2021-07-28" },
    { resource: "conversations", scope: "conversations.readonly", path: "/conversations/search?locationId=" + encodeURIComponent(locationId) + "&limit=1", version: "2021-04-15" },
    { resource: "workflows", scope: "workflows.readonly", path: "/workflows/?locationId=" + encodeURIComponent(locationId), version: "2021-07-28" },
  ] as const;
  const results = await Promise.all(checks.map(async check => {
    try {
      const res = await fetch(base + check.path, {
        headers: { Authorization: "Bearer " + token, Accept: "application/json", Version: check.version },
        cache: "no-store", signal: AbortSignal.timeout(10000)
      });
      return { resource: check.resource, requiredScope: check.scope, httpStatus: res.status,
        accessible: res.ok, httpClass:res.status===401?"authentication_failed":res.status===403?"permission_or_location_denied":res.status===404?"route_or_resource_not_found":res.status===429?"rate_limited":res.status>=500?"provider_unavailable":res.ok?"http_success_contract_not_verified":"http_failure", permissionOrLocationIssue: res.status === 401 || res.status === 403 };
    } catch {
      return { resource: check.resource, requiredScope: check.scope, httpStatus: null,
        accessible: false, permissionOrLocationIssue: false, networkFailure: true };
    }
  }));
  return NextResponse.json({ mode: "read_only", results,
    note: "A negativa 403 pode envolver escopo, unidade ou política do GHL; o teste não prova a causa sem consulta às permissões da PIT." },
    { headers: { "Cache-Control": "no-store" } });
}
