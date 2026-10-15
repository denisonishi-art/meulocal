# HighLevel → MeuLocal → OpenDots

Goal: process and persist one authorized Teste22 2 inbound across the existing services.
Architecture: adapt the existing workflow envelope, obtain a unique matching real WhatsApp message ID using existing read helpers, retain the existing local stop-on-reply flow, and persist/return the authenticated OpenDots decision receipt in ghl_events.payload_meta. Reject missing or ambiguous identity before writes. No new services, tables, messages, or automatic replies.
Spec: /Users/denisonishi/Documents/meulocal/docs/evidence/highlevel-opendots-bridge-2026-10-14/README.md plus the user's authorization and verified workflow/runtime configuration.
Execution: one principal executor in this session, per user instructions; no subagents.

- [ ] Test first: workflow customData normalization; provider message identity and ambiguity; HTTP 200 without saved receipt; persisted delivery outcome; unfinished duplicate.
- [ ] Implement only lib/ghl-controlled-inbound.ts, the commercial bridge helper and the HighLevel handler. Preserve native webhook paths and previous checkout.
- [ ] Run focused tests, TypeScript, lint and build; self-review the exact patch and archive evidence.
- [ ] Configure the preserved existing webhook secret in the explicit Vercel project; deploy the isolated change. Verify deployment identity and authentication without printing values.
- [ ] Preserve and update the workflow action; verify/save/publish through the real editor. Confirm execution permissions, then test only Teste22 2 and correlate the real message ID in HighLevel, Vercel, Supabase and the OpenDots saved file. Do not claim success for HTTP 200 alone.
