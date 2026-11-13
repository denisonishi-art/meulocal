-- Avaliações completas do Google por empresa conectada (base do plano Inteligência).
-- Minimização: não guarda nome nem foto de quem avaliou; só o necessário para análise de temas.
create table public.google_reviews(
 business_id uuid not null references public.businesses(id) on delete cascade,
 google_review_id text not null,
 star_rating smallint check(star_rating between 1 and 5),
 comment text,
 reply_comment text,
 reply_updated_at timestamptz,
 review_created_at timestamptz,
 review_updated_at timestamptz,
 first_seen_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now(),
 removed_at timestamptz,
 primary key(business_id,google_review_id)
);
create index google_reviews_business_created on public.google_reviews(business_id,review_created_at desc);
alter table public.google_reviews enable row level security;
revoke all on public.google_reviews from public,anon,authenticated;
grant select,insert,update,delete on public.google_reviews to service_role;
