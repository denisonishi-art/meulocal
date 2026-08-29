create table if not exists prospect_diagnostics (
  id uuid primary key default gen_random_uuid(),
  public_token uuid not null default gen_random_uuid() unique,
  place_id text not null,
  business_name text not null,
  address text,
  rating numeric,
  review_count integer not null default 0,
  score integer not null check (score between 0 and 100),
  competitor_avg_reviews integer,
  review_gap integer,
  niche text,
  region text,
  status text not null default 'approved' check (status in ('approved','contacted','clicked','converted','closed')),
  approved_at timestamptz not null default now(),
  first_contact_at timestamptz,
  diagnostic_opened_at timestamptz,
  cta_clicked_at timestamptz,
  converted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_prospect_diagnostics_token on prospect_diagnostics(public_token);
create index if not exists idx_prospect_diagnostics_place on prospect_diagnostics(place_id);
create index if not exists idx_prospect_diagnostics_status on prospect_diagnostics(status);

alter table prospect_diagnostics enable row level security;
