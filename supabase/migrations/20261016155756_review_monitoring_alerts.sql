-- Monitoring only. No review response/publication capability.
create table public.review_monitor_runs (
 business_id uuid primary key references public.businesses(id),
 last_success_at timestamptz, last_attempt_at timestamptz,
 lease uuid, lease_until timestamptz, error_code text
);
create table public.review_monitor_alerts (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id),
 review_id text not null, version text not null, rating integer not null check(rating between 1 and 5),
 verdict text not null check(verdict in ('negative','attention','clear','uncertain')),
 state text not null check(state in ('ignored','pending','preparing','dispatching','accepted','delivered','uncertain','failed')),
 first_seen_at timestamptz not null default now(), deadline_at timestamptz not null default now()+interval '2 hours',
 next_attempt_at timestamptz not null default now(), lease uuid, lease_until timestamptz,
 dispatch_started_at timestamptz, accepted_at timestamptz, delivered_at timestamptz,
 message_id text, ghl_location_id text, error_code text,
 unique(business_id,review_id,version)
);
create index review_monitor_pending on public.review_monitor_alerts(state,next_attempt_at);
alter table public.review_monitor_runs enable row level security;
alter table public.review_monitor_alerts enable row level security;
revoke all on public.review_monitor_runs,public.review_monitor_alerts from public,anon,authenticated;
grant select,insert,update on public.review_monitor_runs,public.review_monitor_alerts to service_role;

-- Caller uses server credentials; invoker functions expose nothing to public roles.
create function public.claim_review_monitor_connection() returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare r review_monitor_runs; c google_business_connections;
begin
 insert into review_monitor_runs(business_id)
 select distinct g.business_id from google_business_connections g join customer_accounts a on a.business_id=g.business_id and a.user_id=g.user_id
 where g.status='connected' and a.payment_status='active' on conflict do nothing;
 select m.* into r from review_monitor_runs m
 where (m.last_success_at is null or m.last_success_at<now()-interval '1 hour')
 and (m.lease_until is null or m.lease_until<now())
 and exists(select 1 from google_business_connections g join customer_accounts a on a.business_id=g.business_id and a.user_id=g.user_id where g.business_id=m.business_id and g.status='connected' and a.payment_status='active')
 order by m.last_attempt_at nulls first,m.business_id for update of m skip locked limit 1;
 if not found then return null;end if;
 select g.* into strict c from google_business_connections g join customer_accounts a on a.business_id=g.business_id and a.user_id=g.user_id where g.business_id=r.business_id and g.status='connected' and a.payment_status='active';
 update review_monitor_runs set lease=gen_random_uuid(),lease_until=now()+interval '2 minutes',last_attempt_at=now() where business_id=r.business_id returning * into r;
 return jsonb_build_object('business_id',c.business_id,'user_id',c.user_id,'google_account_id',c.google_account_id,'google_location_id',c.google_location_id,'refresh_token_ciphertext',c.refresh_token_ciphertext,'lease',r.lease,'previous_success_at',r.last_success_at);
end $$;
create function public.claim_review_monitor_alert() returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare a review_monitor_alerts;
begin
 update review_monitor_alerts set state='uncertain',error_code='dispatch_receipt_unknown' where state='dispatching' and dispatch_started_at<now()-interval '2 minutes';
 update review_monitor_alerts set state='pending' where state='preparing' and lease_until<now();
 select * into a from review_monitor_alerts where state='pending' and next_attempt_at<=now() order by first_seen_at,id for update skip locked limit 1;
 if not found then return null;end if;
 update review_monitor_alerts set state='preparing',lease=gen_random_uuid(),lease_until=now()+interval '2 minutes' where id=a.id returning * into a;
 return to_jsonb(a);
end $$;
create function public.review_monitor_health() returns jsonb language sql security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object(
 'pending',(select count(*) from review_monitor_alerts where state='pending' and next_attempt_at<=now()),
 'overdue',(select count(*) from review_monitor_alerts where state not in ('ignored','delivered') and deadline_at<now()),
 'uncertain',(select count(*) from review_monitor_alerts where state in ('uncertain','failed')),
 'stale',(select count(*) from customer_accounts a where a.payment_status='active' and (not exists(select 1 from google_business_connections g where g.business_id=a.business_id and g.user_id=a.user_id and g.status='connected') or not exists(select 1 from review_monitor_runs r where r.business_id=a.business_id and r.last_success_at>now()-interval '2 hours')))
 );
$$;
revoke all on function public.claim_review_monitor_connection(),public.claim_review_monitor_alert(),public.review_monitor_health() from public,anon,authenticated;
grant execute on function public.claim_review_monitor_connection(),public.claim_review_monitor_alert(),public.review_monitor_health() to service_role;

-- Enforce Google on server-side completion and activation, including older accounts.
alter function public.record_customer_onboarding(uuid,text,boolean,boolean) rename to record_customer_onboarding_before_monitoring;
create function public.record_customer_onboarding(p_user_id uuid,p_status text,p_business_confirmed boolean default false,p_confirmed boolean default false) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if p_status='completed' and not exists(select 1 from customer_accounts a join google_business_connections g on g.business_id=a.business_id and g.user_id=a.user_id where a.user_id=p_user_id and a.payment_status='active' and g.status='connected' and g.last_sync_status='success') then raise exception 'onboarding_google_required';end if;
 return record_customer_onboarding_before_monitoring(p_user_id,p_status,p_business_confirmed,p_confirmed);
end $$;
alter function public.activate_customer_base(uuid,uuid) rename to activate_customer_base_before_monitoring;
create function public.activate_customer_base(p_business_id uuid,p_user_id uuid) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from google_business_connections where business_id=p_business_id and user_id=p_user_id and status='connected' and last_sync_status='success') then raise exception 'customer_base_google_required';end if;
 return activate_customer_base_before_monitoring(p_business_id,p_user_id);
end $$;
revoke all on function public.record_customer_onboarding(uuid,text,boolean,boolean),public.activate_customer_base(uuid,uuid) from public,anon,authenticated;
grant execute on function public.record_customer_onboarding(uuid,text,boolean,boolean),public.activate_customer_base(uuid,uuid) to service_role;
