# Explicit manual prospect send

The operator exclusively selects companies and confirms each exact recipient/message. No autonomous prospecting, cadence enrollment, workflow tags, form submission or automatic reply is introduced.

Root cause: previous contact check always returned contactAllowed=false and required a pre-existing GHL mapping for the UI button, while not preparing that mapping. New readiness checks email syntax/MX, complete exact-filter GHL identity, DND/history and local restrictions without writing contacts. Green means technically eligible for a manual attempt; mailbox existence and delivery are not guaranteed by syntax/MX.

Contact readiness is signed server-side, expires after 15 minutes, and cannot be changed by the browser. On explicit confirmation only, a durable per-message operator permission prepares/reuses the local lead, safely creates a missing GHL contact (no tags/upsert), binds the exact returned identity, and delegates to the existing delivery journal/provider gate. Recipient consent columns remain unchanged. The permission expires after 30 minutes. Unknown contact creation or delivery acceptance never creates a second automatic attempt. Same company/recipient/message with a different request ID is refused. Existing delivery receipt and opt-out protections remain authoritative.

WhatsApp: an ordinary public phone number does not prove WhatsApp availability. Current free-text readiness requires an existing scoped contact and a recent inbound WhatsApp message (23-hour safety window). New cold WhatsApp numbers/templates are not falsely released.

Read-only GHL audit: four published workflows identified. Acquisition initial trigger requires meulocal:prospectar tag; follow-up trigger requires follow-up tag; confirmation email requires Form 1 submission; controlled inbound bridge already restricted by reply/tag. This flow supplies none of those outbound trigger tags/forms. Existing workflows remain unchanged. Existing contacts carrying the acquisition/follow-up trigger tags are not released for an overlapping manual approach. Dedicated LC email domain mg.meulocal.ia.br observed. Provider send permissions and actual delivery still require a real, explicitly confirmed send; no prospect is messaged as part of this release.

Validation: 76 application contract/regression tests, 15 actual SQL scenarios on PGlite, TypeScript, lint and build passed. Existing hook/CSS warnings remain. SQL tests are not multi-session PostgreSQL concurrency proof.

Database migration 20261016202754 applied once; normalized existing eligibility body guarded by MD5. RLS and service-only execution verified, permissions ledger empty. Before release: businesses 77, leads 77, outreach 144, active local acquisition enrollments 0. Existing Supabase security findings (3 definer views and prior warnings) predate this change; no global clean-security claim.

CLI migration generation was automatically rejected because npx attempted unapproved external telemetry. It was not retried; SQL was tested locally and applied via the connected Supabase migration API instead, with its authoritative ledger version used for the source filename.

Rollback: disable MEULOCAL_MANUAL_OUTREACH_ENABLED, revert application deployment, preserve the permission and delivery ledgers. The additive schema can stay; permission branch applies only to manual intents and leaves automatic outreach consent gates intact.
