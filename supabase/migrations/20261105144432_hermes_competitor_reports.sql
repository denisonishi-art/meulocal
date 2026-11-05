-- Durable, scoped comparative snapshot for permission-based Hermes delivery.
-- Keep Google Places snapshots fresh; public rendering checks expires_at.
create table if not exists public.prospect_comparison_reports (
  diagnostic_id uuid primary key references public.prospect_diagnostics(id) on delete cascade,
  google_place_id text not null,
  snapshot jsonb not null check (jsonb_typeof(snapshot)='object'),
  observed_at timestamptz not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint comparison_report_fresh_window check (expires_at>observed_at and expires_at<=observed_at+interval '30 days')
);
create index if not exists prospect_comparison_reports_expiry_idx on public.prospect_comparison_reports(expires_at);
alter table public.prospect_comparison_reports enable row level security;
revoke all on public.prospect_comparison_reports from public,anon,authenticated;
grant select,insert,update,delete on public.prospect_comparison_reports to service_role;
-- This table has no client role policies. Public report pages use a server-only
-- service role client, scoped by an unguessable prospect diagnostic token.
