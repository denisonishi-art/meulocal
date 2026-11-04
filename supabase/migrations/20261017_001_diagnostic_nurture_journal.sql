-- Draft-only durable ledger for post-diagnostic nurture. NOT applied to production.
-- Never enrolls, dispatches or calls external services.
create table public.diagnostic_nurture_journal (
 id uuid primary key default gen_random_uuid(),
 lead_id uuid not null references public.leads(id) on delete restrict,
 business_id uuid not null references public.businesses(id) on delete restrict,
 stage text not null check(stage in ('d0','d1','d3','d5','d7')),
 channel text not null check(channel in ('email','whatsapp')),
 status text not null default 'review_pending'
  check(status in ('review_pending','approved','reserved','dispatching','sent','uncertain','cancelled')),
 diagnostic_id uuid references public.diagnostics(id) on delete restrict,
 provider text,
 provider_message_id text,
 request_fingerprint text not null,
 reserved_until timestamptz,
 dispatched_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(lead_id,business_id,stage),
 constraint nurture_sent_requires_receipt check(status<>'sent' or
   (nullif(provider,'') is not null and nullif(provider_message_id,'') is not null and dispatched_at is not null))
);
create unique index diagnostic_nurture_unique_receipt
 on public.diagnostic_nurture_journal(provider,provider_message_id)
 where provider_message_id is not null;
create index diagnostic_nurture_queue_idx on public.diagnostic_nurture_journal(status,created_at)
 where status in ('review_pending','uncertain');
alter table public.diagnostic_nurture_journal enable row level security;
revoke all on public.diagnostic_nurture_journal from public,anon,authenticated;
comment on table public.diagnostic_nurture_journal is
 'Review-only nurture journal. No workflow, scheduler or send is installed by this migration.';
