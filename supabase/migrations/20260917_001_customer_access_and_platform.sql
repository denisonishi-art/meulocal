-- Customer access, payments, Google Business sync and GHL event storage.
-- This migration is intentionally additive so it can be applied to a restored project.

create extension if not exists citext;

alter table businesses
  add column if not exists ghl_allocation_status text,
  add column if not exists ghl_location_ref uuid;

alter table prospect_diagnostics
  add column if not exists competition_mode text,
  add column if not exists competition_label text,
  add column if not exists search_intent text;

create table if not exists customer_accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references businesses(id) on delete cascade,
  user_id uuid unique references auth.users(id) on delete set null,
  onboarding_status text not null default 'pending' check (onboarding_status in ('pending','in_progress','completed')),
  payment_provider text,
  payment_status text not null default 'pending' check (payment_status in ('pending','active','past_due','canceled')),
  external_subscription_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists payment_checkouts (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'asaas',
  external_checkout_id text unique,
  external_reference text unique,
  external_subscription_id text,
  business_id uuid not null references businesses(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  customer_account_id uuid references customer_accounts(id) on delete set null,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'BRL',
  billing_type text,
  cycle text,
  status text not null default 'created' check (status in ('created','paid','canceled','expired')),
  checkout_url text,
  customer_name text,
  customer_email citext,
  customer_phone text,
  paid_at timestamptz,
  activation_status text check (activation_status is null or activation_status in ('invited','linked','error')),
  activation_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_event_id text not null,
  event_type text not null,
  external_checkout_id text,
  external_subscription_id text,
  external_payment_id text,
  external_reference text,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, external_event_id)
);

create table if not exists google_business_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  google_account_id text,
  google_location_id text,
  google_location_name text,
  refresh_token_ciphertext text,
  token_expires_at timestamptz,
  status text not null default 'pending' check (status in ('pending','connected','revoked')),
  connected_at timestamptz,
  last_sync_at timestamptz,
  last_sync_status text,
  last_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, business_id)
);

create table if not exists google_sync_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  source text not null check (source in ('manual','cron','onboarding')),
  status text not null check (status in ('success','failed')),
  review_count integer,
  pages_fetched integer,
  score integer,
  score_version text,
  error_code text,
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists score_snapshots (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  score integer not null check (score between 0 and 100),
  band text not null,
  review_count integer not null default 0,
  google_rating numeric,
  response_rate integer,
  reviews_last_30d integer,
  competitor_avg_score numeric,
  competitor_avg_reviews numeric,
  score_version text,
  score_factors jsonb not null default '{}'::jsonb,
  snapshot_date date not null default current_date,
  created_at timestamptz not null default now(),
  unique (business_id, snapshot_date)
);

create table if not exists ghl_events (
  id uuid primary key default gen_random_uuid(),
  external_event_id text not null unique,
  event_type text not null,
  ghl_location_id text,
  contact_id text,
  conversation_id text,
  message_id text,
  direction text,
  channel text,
  normalized_status text,
  opted_out boolean not null default false,
  conversion boolean not null default false,
  payload_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists ghl_workspaces (
  id uuid primary key default gen_random_uuid(),
  name text,
  active boolean not null default true,
  environment text not null default 'production',
  plan_tier text,
  created_at timestamptz not null default now()
);

create table if not exists ghl_locations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references ghl_workspaces(id) on delete set null,
  business_id uuid not null unique references businesses(id) on delete cascade,
  ghl_location_id text not null unique,
  name text not null,
  allocation_mode text not null default 'dedicated',
  lifecycle_status text not null default 'active',
  provisioned_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists ghl_provisioning_jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  workspace_id uuid references ghl_workspaces(id) on delete set null,
  requested_mode text not null,
  status text not null,
  external_location_id text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists prospecting_learning_by_niche (id uuid primary key default gen_random_uuid(), niche text unique, contact_to_conversion_pct numeric, created_at timestamptz not null default now());
create table if not exists prospecting_learning_by_channel (id uuid primary key default gen_random_uuid(), channel text unique, conversion_rate_pct numeric, created_at timestamptz not null default now());
create table if not exists prospecting_learning_by_message (id uuid primary key default gen_random_uuid(), message_key text unique, conversion_rate_pct numeric, created_at timestamptz not null default now());

create index if not exists idx_customer_accounts_user on customer_accounts(user_id);
create unique index if not exists uq_leads_business_email on leads (business_id, email) where email is not null;
create index if not exists idx_payment_checkouts_reference on payment_checkouts(external_reference);
create index if not exists idx_payment_checkouts_subscription on payment_checkouts(external_subscription_id);
create index if not exists idx_payment_events_reference on payment_events(external_reference);
create index if not exists idx_google_connections_status on google_business_connections(status);
create index if not exists idx_score_snapshots_business on score_snapshots(business_id, snapshot_date desc);

drop trigger if exists trg_customer_accounts_updated_at on customer_accounts;
create trigger trg_customer_accounts_updated_at before update on customer_accounts for each row execute function set_updated_at();
drop trigger if exists trg_payment_checkouts_updated_at on payment_checkouts;
create trigger trg_payment_checkouts_updated_at before update on payment_checkouts for each row execute function set_updated_at();
drop trigger if exists trg_google_business_connections_updated_at on google_business_connections;
create trigger trg_google_business_connections_updated_at before update on google_business_connections for each row execute function set_updated_at();

alter table customer_accounts enable row level security;
alter table payment_checkouts enable row level security;
alter table payment_events enable row level security;
alter table google_business_connections enable row level security;
alter table google_sync_logs enable row level security;
alter table score_snapshots enable row level security;
alter table ghl_events enable row level security;
alter table ghl_workspaces enable row level security;
alter table ghl_locations enable row level security;
alter table ghl_provisioning_jobs enable row level security;
alter table prospecting_learning_by_niche enable row level security;
alter table prospecting_learning_by_channel enable row level security;
alter table prospecting_learning_by_message enable row level security;

create policy "customer reads own account" on customer_accounts for select to authenticated using (user_id = auth.uid());
create policy "customer reads own scores" on score_snapshots for select to authenticated using (exists (select 1 from customer_accounts ca where ca.business_id = score_snapshots.business_id and ca.user_id = auth.uid()));
