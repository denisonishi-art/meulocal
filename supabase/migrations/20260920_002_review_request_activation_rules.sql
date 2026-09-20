create table if not exists public.review_request_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','active','paused')),
  day1_limit integer not null default 30 check (day1_limit between 1 and 500),
  day2_limit integer not null default 40 check (day2_limit between 1 and 500),
  steady_limit integer not null default 50 check (steady_limit between 1 and 500),
  weekdays_only boolean not null default true,
  max_attempts integer not null default 3 check (max_attempts between 1 and 5),
  reminder_day_offsets integer[] not null default array[0,3,7],
  timezone text not null default 'America/Sao_Paulo',
  activated_at timestamptz,
  paused_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.review_request_enrollments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  contact_id uuid not null references public.customer_contacts(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','active','completed','paused','opted_out','failed')),
  activation_date date,
  current_step integer not null default 0 check (current_step between 0 and 3),
  attempts integer not null default 0 check (attempts between 0 and 5),
  next_run_at timestamptz,
  last_sent_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(contact_id)
);

create table if not exists public.review_request_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  enrollment_id uuid not null references public.review_request_enrollments(id) on delete cascade,
  contact_id uuid not null references public.customer_contacts(id) on delete cascade,
  channel text not null check (channel in ('email','whatsapp','system')),
  event_type text not null check (event_type in ('queued','sent','delivered','replied','failed','opted_out','review_observed','completed')),
  provider text,
  external_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_review_request_enrollments_due on public.review_request_enrollments(status,next_run_at);
create index if not exists idx_review_request_enrollments_business on public.review_request_enrollments(business_id,created_at desc);
create index if not exists idx_review_request_events_business on public.review_request_events(business_id,created_at desc);

alter table public.review_request_settings enable row level security;
alter table public.review_request_enrollments enable row level security;
alter table public.review_request_events enable row level security;

drop policy if exists "customer_read_review_request_settings" on public.review_request_settings;
create policy "customer_read_review_request_settings" on public.review_request_settings
for select using (exists(select 1 from public.customer_accounts ca where ca.user_id=auth.uid() and ca.business_id=review_request_settings.business_id));

drop policy if exists "customer_read_review_request_enrollments" on public.review_request_enrollments;
create policy "customer_read_review_request_enrollments" on public.review_request_enrollments
for select using (exists(select 1 from public.customer_accounts ca where ca.user_id=auth.uid() and ca.business_id=review_request_enrollments.business_id));

drop policy if exists "customer_read_review_request_events" on public.review_request_events;
create policy "customer_read_review_request_events" on public.review_request_events
for select using (exists(select 1 from public.customer_accounts ca where ca.user_id=auth.uid() and ca.business_id=review_request_events.business_id));
