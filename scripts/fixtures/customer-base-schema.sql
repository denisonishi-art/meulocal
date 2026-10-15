-- SYNTHETIC ONLY. Fields observed read-only in vznecxfmnthyxvsxwpzi on 2026-10-15.
-- The original base-table migration is absent. Full remote DDL is NOT_VERIFIED.
-- Contact unique/status contracts match the preserved observed contact fixture.
drop table public.customer_contacts;
create table public.customer_imports(
 id uuid primary key default gen_random_uuid(),business_id uuid not null references businesses(id),user_id uuid,
 file_name text,status text not null default 'processing',total_rows integer not null default 0,
 valid_rows integer not null default 0,invalid_rows integer not null default 0,duplicate_rows integer not null default 0,
 created_at timestamptz not null default now(),confirmed_at timestamptz
);
create table public.customer_contacts(
 id uuid primary key default gen_random_uuid(),business_id uuid not null references businesses(id),import_id uuid references customer_imports(id),
 name text,email text,whatsapp text,last_purchase_at timestamptz,contact_key text not null,
 status text not null default 'imported' check(status in ('imported','eligible','queued','active','completed','opted_out','invalid')),
 opt_out_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),ghl_contact_id text,ghl_location_id text,
 unique(business_id,contact_key)
);
alter table public.customer_imports enable row level security;
alter table public.customer_contacts enable row level security;
