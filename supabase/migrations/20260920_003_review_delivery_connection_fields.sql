alter table public.google_business_connections
  add column if not exists google_place_id text,
  add column if not exists google_maps_url text,
  add column if not exists google_review_url text;

alter table public.customer_contacts
  add column if not exists ghl_contact_id text,
  add column if not exists ghl_location_id text;

create index if not exists idx_customer_contacts_ghl_contact
on public.customer_contacts(ghl_location_id, ghl_contact_id)
where ghl_contact_id is not null;
