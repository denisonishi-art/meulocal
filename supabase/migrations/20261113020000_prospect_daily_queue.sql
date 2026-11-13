-- Fila diária de prospecção: 10 empresas por dia com e-mail oficial validado e mensagem pronta.
-- Nenhum envio acontece aqui; a fila só prepara candidatos para aprovação do operador.
create table public.prospect_daily_runs(
 queue_date date primary key,
 niche text not null,
 region text not null,
 status text not null default 'processing' check(status in ('processing','ready','empty','failed')),
 searched boolean not null default false,
 found integer not null default 0,
 ready_count integer not null default 0,
 last_error text,
 lease_until timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.prospect_daily_queue(
 id uuid primary key default gen_random_uuid(),
 queue_date date not null references public.prospect_daily_runs(queue_date) on delete cascade,
 place_id text not null,
 name text not null,
 address text,
 website text,
 rating numeric,
 reviews integer,
 score integer,
 email text,
 status text not null default 'candidate' check(status in ('candidate','verified','ready','blocked','dismissed')),
 reason text,
 message text,
 rationale text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
-- Uma empresa entra na fila uma única vez; candidatos não usados são apagados ao fim da execução.
create unique index prospect_daily_queue_place on public.prospect_daily_queue(place_id);
create index prospect_daily_queue_day on public.prospect_daily_queue(queue_date,status);
alter table public.prospect_daily_runs enable row level security;
alter table public.prospect_daily_queue enable row level security;
revoke all on public.prospect_daily_runs,public.prospect_daily_queue from public,anon,authenticated;
grant select,insert,update,delete on public.prospect_daily_runs,public.prospect_daily_queue to service_role;

create or replace function public.claim_daily_prospect_run(p_date date,p_niche text,p_region text,p_lease_seconds integer default 330)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp set lock_timeout='3s' as $$
declare r public.prospect_daily_runs;
begin
 insert into prospect_daily_runs(queue_date,niche,region) values(p_date,p_niche,p_region) on conflict(queue_date) do nothing;
 select * into r from prospect_daily_runs where queue_date=p_date for update;
 if r.status in ('ready','empty') then return jsonb_build_object('claimed',false,'status',r.status);end if;
 if r.lease_until is not null and r.lease_until>now() then return jsonb_build_object('claimed',false,'status','busy');end if;
 update prospect_daily_runs set status='processing',lease_until=now()+make_interval(secs=>p_lease_seconds),updated_at=now() where queue_date=p_date;
 return jsonb_build_object('claimed',true,'status','processing','niche',r.niche,'region',r.region,'searched',r.searched);
end $$;
revoke all on function public.claim_daily_prospect_run(date,text,text,integer) from public,anon,authenticated;
grant execute on function public.claim_daily_prospect_run(date,text,text,integer) to service_role;
