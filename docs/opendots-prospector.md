# MeuLocal Prospector | OpenDots integration contract

Status: implementation scaffold (NOT LIVE). It does **not** implement an OpenDots installation, real web discovery, GHL sync or Telegram bot.

## Ownership

- OpenDots worker: discover real local business records through approved APIs/search providers; capture source URLs and observation dates; submit candidates for assessment.
- MeuLocal Prospector: validate, deduplicate and qualify candidates using verified evidence. Fail closed without the private API key.
- Resultado com IA: sole owner of commercial conversations, qualification, human handoff and follow-ups.
- GHL: contacts/conversations/opportunities source of truth. Prospecting endpoint NEVER writes to GHL.
- Sending messages requires a separate approval-based workflow; it is never triggered here.

## First job

Segment: geradores. City: Sao Paulo. State: SP. Batch: max 50. Mode: research_only.

## Endpoint

POST /api/agents/prospecting
Header: x-prospector-api-key: [secret] (configured via MEULOCAL_PROSPECTOR_API_KEY on server)
Required request body:

```json
{
  "segment": "geradores",
  "city": "Sao Paulo",
  "state": "SP",
  "requestedLimit": 10,
  "mode": "research_only",
  "leads": [{
    "externalId": "provider:unique-business-id",
    "name": "Business example (replace with actual evidence)",
    "segment": "geradores",
    "city": "Sao Paulo",
    "state": "SP",
    "evidence": [{
      "signal": "few_reviews",
      "url": "https://example.com/source",
      "observedAt": "2026-10-12T00:00:00Z",
      "description": "Verified observation from authorized source",
      "verified": false
    }]
  }]
}
```

Output: ranked assessments with score, evidence reasons, pending_review status. Evidence marked verified must actually have been verified by the source adapter; never guess or fabricate. The server checks format, not external truth.

## Safety / go-live gates

1. Provision a private per-environment key via secret manager; never commit it.
2. Restrict endpoint to intended backend callers and add rate limits and audit logs before internet exposure.
3. Validate a provider adapter against live evidence and source terms.
4. Add lead provenance, retention controls and suppressions before CRM handoff.
5. Link by deduplicated ID and prevent the Resultado com IA outreach workflow from being triggered by discovery automatically.
6. Run build/tests, stage deploy and an authenticated smoke before enabling in production.
7. Never change the existing WhatsApp/GHL connection.

## Cost

Record discovery provider charges and model usage in the OpenDots worker. This scoring module makes no model calls.
