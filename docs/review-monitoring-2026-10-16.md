# Review monitoring — implementation and release evidence

## Product contract

Google Business connection and a successful authenticated sync are required to complete onboarding and activate a customer base. CSV import remains available without a CRM integration. Pricing and Asaas were not changed.

Reviews are read only. No model tools, Google reply write endpoints or public response generation were added. One/two stars raise an alert; three stars require attention. Four/five-star comments are classified for complaints. Missing configuration, invalid model output and model failure produce an uncertain verdict and an alert, never an automatic dismissal.

The home and customer dashboard describe hourly checks and a target of alerting within three hours after a review becomes available through the Google API, while the integration and notification channel are active. Google availability is not directly observable: Google creation timestamps do not prove API availability. Store first detection time and use a conservative internal two-hour delivery deadline, leaving one hour for detection. This is a service target, not a production SLA already proven by these tests.

Notifications go only to the verified email of the authenticated account owner. The existing GHL email provider is reused after owner, location, exact email and DND checks. No reviewer is contacted. Acceptance by GHL is distinct from delivery. Signed native GHL delivery/failure receipts reconcile matching message/location IDs. Native message-status webhook subscription and actual receipt delivery still require remote validation. Missing receipt, overdue delivery or uncertain acceptance remain visible; uncertain sends are not automatically repeated.

## Persistence and isolation

Migration `20261016155756_review_monitoring_alerts.sql` adds service-only RLS-protected ledgers, exclusive leases, unique `(business_id, review_id, version)` observations and monitoring health. Versions hash rating/comment, excluding provider timestamp-only changes. Raw comments and author names are not stored. Model tracing is disabled. Each customer status endpoint uses the authenticated business context. The admin endpoint exposes aggregate health and exceptions only to administrators.

The migration wraps the existing onboarding/base activation RPCs and requires the earlier migrations already in main. Do not apply it out of order. The existing daily reputation aggregation remains unchanged.

## Configuration and scheduler

Required existing secrets: CRON_SECRET, Supabase server credentials, Google token encryption/OAuth credentials, GHL credentials/location. Never put secret values in this document, source, command arguments or chat.

New settings:
- MEULOCAL_REVIEW_MONITOR_ENABLED: leave false until release validation.
- MEULOCAL_REVIEW_MONITOR_MODEL: explicitly select an approved model using the existing OPENAI_API_KEY. Without it, text analysis is uncertain and still alerts.
- MEULOCAL_MONITOR_BASE_URL: https://meulocal.ia.br for the external runner.

Vercel Hobby only supports daily cron jobs: https://vercel.com/docs/cron-jobs/usage-and-pricing . Do not add an hourly entry to vercel.json on Hobby. The supplied systemd service/timer are templates for the existing VPS, not installed services. Confirm the existing service user, Node path and application directory before installation. Store CRON_SECRET in `/etc/meulocal/review-monitor.env`, readable only by root and the designated service group. Use the same secret as the application. Do not print the environment file.

The timer invokes `scripts/run-review-monitor.mjs` hourly. The runner drains bounded sequential batches (up to 100 requests); each endpoint invocation processes up to five unseen reviews and one pending alert. Old reviews are included on initial activation and can generate alerts: review the initial backlog before enabling. A large backlog or partial/truncated Google scan remains incomplete and must not be presented as healthy. The runner exits nonzero for failures/overdue work; connect systemd failures and `/api/admin/review-monitor` health to the existing operator monitoring before commercial activation. A timer alone is not operational alerting.

## Validation performed locally

- 18 monitoring tests: rating rules, complaint parsing, model failure, version identity, tenant separation, bounded resume, storage errors, verified owner-only email, recipient scope rejection and uncertain provider acceptance.
- Seven route tests: secret/flag guards, required server configuration, authentication, account eligibility, tenant scope and unavailable storage.
- Seven existing dashboard regression tests, updated for mandatory Google.
- PGlite runs the actual migration: onboarding/activation gates, connection/alert leases, unknown dispatch recovery without replay, unique ledger, health and public permission denial. This does not replace a full existing-schema migration rehearsal.
- TypeScript, lint and production build checked. Existing hook/CSS warnings remain.

Other existing webhook/onboarding/delivery regression scripts require their owned Docker/Postgres platform and could not execute here. Do not count them as passed. Browser plugin connection failed in this environment, so visual browser review remains pending. No real Google/model/email requests were made by these tests.

## Release gate and rollback

This branch is an implementation candidate; no remote migration, production deployment, scheduler installation, email or commercial message was performed. The earlier read-only production check found no connected Google accounts, so there is no legitimate connected customer available for end-to-end proof.

Before publishing the home promise: rehearse migrations against the full schema; validate authenticated routes and real UI; apply migration; deploy with monitoring disabled; provision the hourly timer and failure visibility on the existing VPS; verify an authorized owner's Google connection/email and GHL status receipts, including that contact upsert cannot trigger unrelated commercial workflows; enable only the controlled pilot; prove detection, classification, persistent queue, provider acceptance and confirmed delivery with timestamps. Use controlled fixtures for negative reviews; do not create fake public Google reviews. A genuine authorized review is required for a full Google-source proof. Record the timestamp limitation above.

Rollback: disable MEULOCAL_REVIEW_MONITOR_ENABLED and stop the timer; retain ledgers and uncertain receipts for reconciliation. Revert the application/home if needed; do not drop evidence tables or replay uncertain sends. No production success may be claimed from local tests or provider acceptance alone.
