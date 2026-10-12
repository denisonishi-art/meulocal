# RCIA / MeuLocal opt-out integration (pre-deployment checklist)

Status: code in development branches. No production deployment authorized.

## Architecture
- RCIA calls MeuLocal POST /api/internal/rcia-opt-out with authenticated header x-rcia-sync-secret.
- Payload: {locationId, contactId, intent:'opt_out'} (never log raw inbound message or token).
- MeuLocal validates known lead, removes GHL acquisition/follow-up tags, writes opt_out_at and cancels local enrollment, then acknowledges. A non-2xx response is NOT success.
- RCIA suppresses agent invocation for explicit opt-out even if the sync fails; failed sync must be retried/alerted, not reported as delivered.

## Configuration (never commit values)
- Resultado com IA: MEULOCAL_RCIA_SYNC_URL = https://<meulocal-host>/api/internal/rcia-opt-out ; MEULOCAL_RCIA_SYNC_SECRET = dedicated random secret ; MEULOCAL_GHL_LOCATION_ID = verified MeuLocal location.
- MeuLocal: MEULOCAL_RCIA_SYNC_SECRET = same dedicated secret ; GHL_LOCATION_ID = verified location ; write-capable GHL token with limited contacts tag scope. Read-only audit token is insufficient.
- Use isolated preview environment on both projects before production, with authorized test contacts only.

## End-to-end acceptance criteria
1. Authorized inbound opt-out: no agent invocation, no outbound; removed both GHL tags; lead opted out; active enrollment cancelled.
2. Repeated event: no repeated sends or duplicate effects; idempotent result.
3. Wrong secret/location/contact: reject without mutation.
4. GHL tag removal failure: return error; do not claim synchronized; alert and retry safely.
5. Interest/non-opt-out: unchanged existing RCIA behavior.
6. Verify opt-out across OTHER active GHL workflows; tag removal alone does not guarantee unenrollment from running workflows. Explicit workflow-stop and global DND/consent suppression require separate verification.
7. Confirm template-approved status AND legal contact eligibility before any campaign. No unrestricted freeform WhatsApp outbound.

## Release gate
Do not merge/deploy until tests, preview end-to-end proof and GHL workflow enrollment safeguards all pass. Rotate bridge secret exposed in screenshots in a coordinated change window.

## Verified HighLevel removal API (2026-10-12)
- Per-contact, per-workflow endpoint: DELETE /contacts/:contactId/workflow/:workflowId with scoped contacts.write, Version header, and required JSON eventStartTime. Reference: https://marketplace.gohighlevel.com/docs/ghl/contacts/delete-contact-from-workflow/
- Workflow IDs for "Aquisição — diagnóstico inicial" and "Régua de aquisição — follow-up" NOT verified. Never substitute guessed IDs.
- Enrollment start timestamps not verified; validate the API contract with an authorized test contact.
- HighLevel connector currently returns 401; no live workflow removal performed.
- MEULOCAL_GHL_WORKFLOW_UNENROLLMENT_READY is a protective placeholder, NOT proof. Keep disabled until the implementation verifies both workflow removals.

## Workflow links supplied by operator (2026-10-12)
- GHL location: `uNh3KsM7WFuLeTN8Q583`
- Workflow A: `bb6f4a2b-46d7-4e23-9c99-176461551583`
- Workflow B: `f4500c60-e33d-41f5-a461-c146662e226e`
- Exact name-to-ID association NOT yet verified; verify before edits.
- Links establish workflow IDs but do not prove live enrollment or allow mutation.
