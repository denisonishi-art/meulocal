# Review monitoring — implementation and release evidence

## Product contract

Google Business connection and a successful authenticated sync are required to complete onboarding and activate a customer base. CSV import remains available without a CRM integration. Pricing and Asaas were not changed.

Reviews are read only. No model tools, Google reply write endpoints or public response generation were added. One/two stars raise an alert; three stars require attention. Four/five-star comments are classified for complaints. Missing configuration, invalid model output and model failure produce an uncertain verdict and an alert, never an automatic dismissal.

The owner-defined deadline is notification within three hours of the review being posted, not three hours after API availability. `review_published_at` records Google's createTime and `deadline_at` is exactly that time plus three hours. `first_seen_at` separately records detection. Missing/invalid posting time remains explicit and unhealthy, with no invented deadline. Late API availability or initial backlog can already exceed the deadline at detection; preserve and expose the breach. The deadline is the product requirement, but compliance is NOT_VERIFIED until a legitimate source-to-delivery pilot. Public copy stays marked as validation until proof exists.

Notifications go only to the verified email of the authenticated account owner. The existing GHL email provider is reused after owner, location, exact email and DND checks. The pilot requires an explicit business ID and existing controlled owner contact ID; the monitor never creates or upserts contacts, so it cannot activate contact-created/upsert workflows. Other outbound-message workflow effects remain a pilot audit gate. No reviewer is contacted. Acceptance by GHL is distinct from delivery. Signed native outbound email delivery/failure receipts are stored durably and reconcile matching message/location/contact IDs, including receipts arriving before acceptance and while monitoring is disabled. Delivery is monotonic and cannot be downgraded by a late failure. Native message-status webhook subscription and actual receipt delivery still require remote validation. Missing receipt, overdue delivery or uncertain acceptance remain visible; uncertain sends are not automatically repeated.

## Persistence and isolation

Migration `20261016155756_review_monitoring_alerts.sql` adds service-only RLS-protected ledgers, exclusive leases, unique `(business_id, review_id, version)` observations and monitoring health. Versions hash rating/comment, excluding provider timestamp-only changes. Raw comments and author names are not stored. Model tracing is disabled. Each customer status endpoint uses the authenticated business context. The admin endpoint exposes aggregate health and exceptions only to administrators.

The migration wraps the existing onboarding/base activation RPCs and requires the earlier migrations already in main. Do not apply it out of order. The existing daily reputation aggregation remains unchanged.

## Configuration and scheduler

Required existing secrets: CRON_SECRET, Supabase server credentials, Google token encryption/OAuth credentials, GHL credentials/location. Never put secret values in this document, source, command arguments or chat.

New settings:
- MEULOCAL_REVIEW_MONITOR_ENABLED: leave false until release validation.
- MEULOCAL_REVIEW_MONITOR_PILOT_BUSINESS_ID and MEULOCAL_REVIEW_MONITOR_OWNER_CONTACT_ID: explicit controlled scope, required before enabling.
- MEULOCAL_REVIEW_MONITOR_CRON_SECRET: dedicated scheduler secret; do not rotate the existing shared CRON_SECRET.
- MEULOCAL_REVIEW_MONITOR_MODEL: explicitly select an approved model using the existing OPENAI_API_KEY. Without it, text analysis is uncertain and still alerts.
- MEULOCAL_MONITOR_BASE_URL: https://meulocal.ia.br for the external runner.

Vercel Hobby only supports daily cron jobs: https://vercel.com/docs/cron-jobs/usage-and-pricing . Do not add an hourly entry to vercel.json on Hobby. The systemd service reuses Node v24.21.0 in the existing meulocal-opendots container (host has no Node). The existing Docker operator is root; no new user or host Node install is required. Installation evidence is recorded separately. Confirm the existing service user, Node path and application directory before installation. Store CRON_SECRET in `/etc/meulocal/review-monitor.env`, readable only by root and the designated service group. Map the dedicated application scheduler secret to CRON_SECRET in this runner-only file. Disabled executions are successful logged no-ops; authentication failures remain nonzero. Do not print the environment file.

The timer invokes `scripts/run-review-monitor.mjs` hourly. The runner drains bounded sequential batches (up to 100 requests); each endpoint invocation processes up to five unseen reviews and one pending alert. Old reviews are included on initial activation and can generate alerts: review the initial backlog before enabling. A large backlog or partial/truncated Google scan remains incomplete and must not be presented as healthy. The runner exits nonzero for failures/overdue work; connect systemd failures and `/api/admin/review-monitor` health to the existing operator monitoring before commercial activation. A timer alone is not operational alerting.

## Validation performed locally

- Monitoring tests: rating rules, complaint parsing, model failure, version identity, tenant separation, bounded resume, storage errors, verified owner-only email, recipient scope rejection and uncertain provider acceptance.
- Seven route tests: secret/flag guards, required server configuration, authentication, account eligibility, tenant scope and unavailable storage.
- Seven existing dashboard regression tests, updated for mandatory Google.
- PGlite runs the actual migration: onboarding/activation gates, connection/alert leases, unknown dispatch recovery without replay, unique ledger, health and public permission denial. This does not replace a full existing-schema migration rehearsal.
- TypeScript, lint and production build checked. Existing hook/CSS warnings remain.

Release review: 45 focused tests and 28 existing webhook/onboarding/activation regressions passed. Eleven additional scenarios passed in an owned disposable PostgreSQL 17.6 database reconstructed from the current production public DDL (35 tables, 98 functions, 199 constraints, 125 indexes, 10 policies, 9 triggers, 47 historical versions). Auth dependency stubs and synthetic rows were used; this is not a full Supabase Auth/platform clone. Concurrent early receipts, late reconciliation, duplicates, wrong location/tenant, lease rejection, RLS and RPC privileges were exercised. Browser validation used the actual Next UI with synthetic local-only intercepted data: home FAQ, disabled state, accepted versus delivered, uncertainty, overdue and unknown posting timestamp. No real Google/model/email requests or sends occurred in these tests. Build and typecheck passed; lint passed with two existing hook warnings.

## Release gate and rollback

The release review applied migration 20261016155756 once in a transaction, verified its SHA-256 and preserved all 47 previous historical entries. The dedicated scheduler secret and disabled production flag were configured; the existing shared cron secret was not rotated. VPS runner/service/timer files were installed using the existing container Node, with root-only secrets and a private backup. Deployment of merge 821e29e is READY on meulocal.ia.br, and the timer is enabled. A manual systemd execution succeeded as a disabled no-op. The exact deployment, authentication checks and next timer execution are recorded in the publication checkpoint below. No automatic hourly firing or real Google-to-email pilot was observed in this checkpoint. No email or commercial message was sent. The refreshed production check on 2026-10-16 found zero Google connections and zero eligible verified owners; Google OAuth credentials and encryption configuration are absent from the deployed application. The earlier read-only production check also found no connected Google accounts, so there is no legitimate connected customer available for end-to-end proof.

Before publishing the home promise: rehearse migrations against the full schema; validate authenticated routes and real UI; apply migration; deploy with monitoring disabled; provision the hourly timer and failure visibility on the existing VPS; verify an authorized owner's Google connection/email and GHL status receipts, including that contact upsert cannot trigger unrelated commercial workflows; enable only the controlled pilot; prove detection, classification, persistent queue, provider acceptance and confirmed delivery with timestamps. Use controlled fixtures for negative reviews; do not create fake public Google reviews. A genuine authorized review is required for a full Google-source proof. Record the timestamp limitation above.

Rollback: disable MEULOCAL_REVIEW_MONITOR_ENABLED and stop the timer; retain ledgers and uncertain receipts for reconciliation. Revert the application/home if needed; do not drop evidence tables or replay uncertain sends. No production success may be claimed from local tests or provider acceptance alone.

## Publication checkpoint

See [release checkpoint](evidence/review-monitor-publication-2026-10-16/CHECKPOINT.md) for the exact deployed commit, timer state and remaining real-provider gates. The monitor must remain disabled until a legitimate Google connection, controlled verified owner contact, native GHL delivery receipts and operator failure monitoring are validated. No promised three-hour compliance has been demonstrated.
