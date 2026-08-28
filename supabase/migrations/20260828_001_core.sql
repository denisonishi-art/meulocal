create extension if not exists pgcrypto;

create table if not exists businesses (
  id uuid primary key default gen_random_uuid(),
  google_place_id text unique,
  name text not null,
  category text,
  address text,
  city text,
  neighborhood text,
  latitude numeric,
  longitude numeric,
  phone text,
  website text,
  google_rating numeric,
  google_review_count integer,
  source text not null default 'inbound' check (source in ('inbound','outbound','manual')),
  status text not null default 'new' check (status in ('new','diagnosed','qualified','contacted','engaged','customer','nurture','lost')),
  ghl_contact_id text,
  ghl_location_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text,
  email text,
  whatsapp text,
  consent_email boolean not null default false,
  consent_whatsapp boolean not null default false,
  origin text not null default 'home',
  lifecycle_stage text not null default 'lead' check (lifecycle_stage in ('lead','mql','conversation','customer','nurture','lost')),
  automation_track text,
  next_action_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists diagnostics (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  presence_score integer not null check (presence_score between 0 and 100),
  presence_band text not null check (presence_band in ('critical','weak','competitive','strong')),
  gain_potential text not null check (gain_potential in ('low','medium','high')),
  review_score integer check (review_score between 0 and 100),
  local_seo_score integer check (local_seo_score between 0 and 100),
  authority_score integer check (authority_score between 0 and 100),
  profile_score integer check (profile_score between 0 and 100),
  primary_gap text,
  summary text,
  recommendations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists competitors (
  id uuid primary key default gen_random_uuid(),
  diagnostic_id uuid not null references diagnostics(id) on delete cascade,
  google_place_id text,
  name text not null,
  distance_meters integer,
  google_rating numeric,
  google_review_count integer,
  presence_score integer check (presence_score between 0 and 100),
  rank_position integer,
  website text,
  created_at timestamptz not null default now()
);

create table if not exists outreach_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  channel text not null check (channel in ('email','whatsapp','sms','system')),
  event_type text not null check (event_type in ('queued','sent','delivered','opened','clicked','replied','failed','unsubscribed')),
  provider text,
  external_id text,
  message_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists automation_enrollments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  track text not null,
  status text not null default 'active' check (status in ('active','paused','completed','cancelled')),
  step integer not null default 0,
  next_run_at timestamptz,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_businesses_status on businesses(status);
create index if not exists idx_businesses_source on businesses(source);
create index if not exists idx_leads_business on leads(business_id);
create index if not exists idx_leads_stage on leads(lifecycle_stage);
create index if not exists idx_diagnostics_business on diagnostics(business_id, created_at desc);
create index if not exists idx_outreach_lead on outreach_events(lead_id, created_at desc);
create index if not exists idx_automation_next_run on automation_enrollments(status, next_run_at);

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_businesses_updated_at on businesses;
create trigger trg_businesses_updated_at before update on businesses for each row execute function set_updated_at();

drop trigger if exists trg_leads_updated_at on leads;
create trigger trg_leads_updated_at before update on leads for each row execute function set_updated_at();

alter table businesses enable row level security;
alter table leads enable row level security;
alter table diagnostics enable row level security;
alter table competitors enable row level security;
alter table outreach_events enable row level security;
alter table automation_enrollments enable row level security;

comment on table businesses is 'Empresas analisadas pelo MeuLocal, vindas de inbound, outbound ou cadastro manual.';
comment on table leads is 'Contatos ligados a empresas e ao ciclo comercial automatizado.';
comment on table diagnostics is 'Histórico da Nota de Presença Local e principais gaps.';
comment on table automation_enrollments is 'Régua comercial ativa de cada lead.';
