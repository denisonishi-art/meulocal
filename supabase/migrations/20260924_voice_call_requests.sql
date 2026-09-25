create table if not exists voice_call_requests (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  prospect_diagnostic_id uuid references prospect_diagnostics(id) on delete set null,
  external_event_id text unique,
  phone text,
  requested_text text,
  provider text not null default 'pipecat',
  status text not null default 'requested',
  external_call_id text,
  error_message text,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_voice_call_requests_lead on voice_call_requests(lead_id, created_at desc);
create index if not exists idx_voice_call_requests_status on voice_call_requests(status, created_at desc);
