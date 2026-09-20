alter table public.leads
  add column if not exists prospect_diagnostic_id uuid references public.prospect_diagnostics(id) on delete set null,
  add column if not exists ghl_contact_id text,
  add column if not exists ghl_location_id text,
  add column if not exists opt_out_at timestamptz,
  add column if not exists last_reply_at timestamptz;

create index if not exists idx_leads_prospect_diagnostic on public.leads(prospect_diagnostic_id);
create index if not exists idx_leads_ghl_contact on public.leads(ghl_location_id,ghl_contact_id) where ghl_contact_id is not null;

create unique index if not exists idx_automation_enrollment_lead_track
on public.automation_enrollments(lead_id,track);

alter table public.outreach_events
  add column if not exists conversation_id text;

create index if not exists idx_outreach_external_id on public.outreach_events(external_id) where external_id is not null;
