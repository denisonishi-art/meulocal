# Manual prospect search correction

Scope: restore operator-driven discovery and safe draft preparation. Denis always selects companies; no autonomous prospecting, contact, CRM write, enrollment or send is introduced.

Root causes observed in production: locationBias admitted Moema/MG for an ambiguous Moema query; missing userRatingCount became zero and fed negative claims into drafts. OPENAI_API_KEY absence was separately fixed by the owner and a production redeploy; five draft responses were observed before this patch, with no sends.

Changes: require explicit UF, resolve one bounded region, enforce rectangle restrictions on each search zone and check coordinates independently. If geocoding is unconfirmed, refuse unrestricted fallback. Preserve multi-zone coverage and deduplication. Unknown counts and scores stay null; UI labels them unknown. Diagnostic preparation refuses unknown counts rather than persisting zero. Draft input excludes review metrics and requires Denis identification plus a consultative question; output validation refuses common count/absence claims. New searches clear stale results/selections/drafts; previous v1 drafts are no longer recovered. Existing send/CRM gates untouched.

Validation: 11 focused route/UI contract tests; 50 existing acquisition-gate, controlled-inbound and payment contract tests. TypeScript and lint checked; two existing lint warnings. Docker-dependent acquisition-routes suite cannot start here (owned_platform_container_required); do not count it as passed. Real PostgreSQL concurrency is outside this patch.

Geography limitation: provider viewport rectangles are bounding boxes, not administrative polygons. Explicit city and UF are required for ambiguous locations. No claim that missing Google review data means zero. Commercial release and OpenDots remote completion remain separate.

Rollback: revert this source patch/deployment; no migration or configuration change needed. Do not restore unsupported draft claims or send messages as part of rollback.
