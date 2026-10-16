-- Durable authority for review messages. No transport is executed by these functions.
alter table public.review_request_settings add column delivery_checked_at timestamptz not null default now();
create index review_settings_delivery_rotation on public.review_request_settings(delivery_checked_at,business_id) where status='active';
create table public.review_message_deliveries(
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id),
 enrollment_id uuid not null references public.review_request_enrollments(id),contact_id uuid not null references public.customer_contacts(id),
 attempt integer not null check(attempt between 1 and 3),state text not null check(state in ('reserved','dispatching','sent','ambiguous','cancelled')),
 lease uuid not null default gen_random_uuid(),lease_until timestamptz not null,available_at timestamptz not null default now(),
 quota_date date not null,channel text check(channel in ('whatsapp','email')),content_hash text,
 ghl_contact_id text,ghl_location_id text,message_id text,conversation_id text,error_code text,
 dispatch_started_at timestamptz,sent_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(enrollment_id,attempt)
);
create index review_delivery_quota on public.review_message_deliveries(business_id,quota_date,state);
create unique index review_delivery_provider_receipt on public.review_message_deliveries(ghl_location_id,message_id) where message_id is not null;
alter table public.review_message_deliveries enable row level security;
revoke all on public.review_message_deliveries from public,anon,authenticated,service_role;
grant select on public.review_message_deliveries to service_role;

create function public.claim_review_delivery(p_business_id uuid,p_at timestamptz default now())
returns jsonb language plpgsql security definer set search_path=public,pg_temp set lock_timeout='3s' as $$
declare a public.customer_accounts;s public.review_request_settings;e public.review_request_enrollments;c public.customer_contacts;
 d public.review_message_deliveries;today date;first_day date;day_index integer;daily_limit integer;used integer;
begin
 if p_at is null then return null;end if;
 select * into a from customer_accounts where business_id=p_business_id for update;
 if not found or a.payment_status<>'active' then return null;end if;
 select * into s from review_request_settings where business_id=p_business_id for update;
 if not found or s.status<>'active' or s.activated_at is null then return null;end if;
 update review_request_settings set delivery_checked_at=p_at where business_id=p_business_id;
 today=(p_at at time zone 'America/Sao_Paulo')::date;
 if (p_at at time zone 'America/Sao_Paulo')::time<time '09:00' then return null;end if;
 if s.weekdays_only and extract(isodow from today)>5 then return null;end if;
 update review_message_deliveries set state='ambiguous',error_code='dispatch_lease_expired',updated_at=p_at
  where business_id=p_business_id and state='dispatching' and lease_until<=p_at;
 select en.* into e from review_request_enrollments en join customer_contacts cc on cc.id=en.contact_id and cc.business_id=en.business_id
  left join review_message_deliveries md on md.enrollment_id=en.id and md.attempt=en.attempts+1
  where en.business_id=p_business_id and en.status in ('queued','active') and en.next_run_at<=p_at and en.attempts<least(s.max_attempts,3)
   and cc.status in ('queued','active') and cc.opt_out_at is null
   and (md.id is null or (md.state='reserved' and md.lease_until<=p_at and md.available_at<=p_at))
   and exists(select 1 from review_request_events ev where ev.enrollment_id=en.id and ev.business_id=p_business_id and ev.event_type='queued' and ev.metadata->>'audienceConfirmed'='true')
   and not exists(select 1 from review_request_events ev where ev.enrollment_id=en.id and ev.event_type in ('replied','opted_out','review_observed'))
  order by en.next_run_at,en.id limit 1 for update of en;
 if not found then return null;end if;
 select * into c from customer_contacts where id=e.contact_id and business_id=p_business_id for update;
 select * into d from review_message_deliveries where enrollment_id=e.id and attempt=e.attempts+1;
 first_day=(s.activated_at at time zone 'America/Sao_Paulo')::date;
 select greatest(1,count(*))::integer into day_index from generate_series(first_day::timestamp,today::timestamp,interval '1 day') day where extract(isodow from day)<6;
 daily_limit=case when day_index=1 then s.day1_limit when day_index=2 then s.day2_limit else s.steady_limit end;
 select count(*)::integer into used from review_message_deliveries
  where business_id=p_business_id and quota_date=today and state in ('reserved','dispatching','sent','ambiguous') and id is distinct from d.id;
 -- Count historical accepted messages too; journaled receipts must not count twice.
 used=used+(select count(distinct (ev.contact_id,coalesce(ev.external_id,ev.id::text)))::integer from review_request_events ev
  where ev.business_id=p_business_id and ev.event_type='sent' and (ev.created_at at time zone 'America/Sao_Paulo')::date=today
   and not exists(select 1 from review_message_deliveries md where md.enrollment_id=ev.enrollment_id and md.message_id=ev.external_id and md.state='sent' and md.quota_date=today));
 if used>=daily_limit then return null;end if;
 if d.id is null then
  insert into review_message_deliveries(business_id,enrollment_id,contact_id,attempt,state,lease_until,quota_date,created_at,updated_at)
   values(p_business_id,e.id,c.id,e.attempts+1,'reserved',p_at+interval '90 seconds',today,p_at,p_at) returning * into d;
 else
  update review_message_deliveries set lease=gen_random_uuid(),lease_until=p_at+interval '90 seconds',quota_date=today,error_code=null,updated_at=p_at
   where id=d.id returning * into d;
 end if;
 return jsonb_build_object('id',d.id,'lease',d.lease,'businessId',p_business_id,'enrollmentId',e.id,'attempt',d.attempt,'activatedAt',s.activated_at,
  'lastSentAt',e.last_sent_at,'contact',jsonb_build_object('id',c.id,'name',c.name,'email',c.email,'whatsapp',c.whatsapp,'ghlContactId',c.ghl_contact_id,'ghlLocationId',c.ghl_location_id));
end $$;

create function public.begin_review_delivery(p_delivery_id uuid,p_lease uuid,p_contact_id text,p_location_id text,p_channel text,p_content_hash text,p_at timestamptz default now())
returns jsonb language plpgsql security definer set search_path=public,pg_temp set lock_timeout='3s' as $$
declare d public.review_message_deliveries;a public.customer_accounts;s public.review_request_settings;e public.review_request_enrollments;c public.customer_contacts;
begin
 select * into d from review_message_deliveries where id=p_delivery_id;
 if not found then return null;end if;
 select * into a from customer_accounts where business_id=d.business_id for update;
 select * into d from review_message_deliveries where id=p_delivery_id for update;
 if p_at is null or d.state<>'reserved' or d.lease is distinct from p_lease or d.lease_until<=p_at then return null;end if;
 select * into s from review_request_settings where business_id=d.business_id for update;
 select * into e from review_request_enrollments where id=d.enrollment_id and business_id=d.business_id for update;
 select * into c from customer_contacts where id=d.contact_id and business_id=d.business_id for update;
 if a.id is null or s.business_id is null or a.payment_status<>'active' or s.status<>'active' or e.id is null or c.id is null or e.contact_id<>c.id
  or d.quota_date<>(p_at at time zone 'America/Sao_Paulo')::date or (s.weekdays_only and extract(isodow from p_at at time zone 'America/Sao_Paulo')>5)
  or (p_at at time zone 'America/Sao_Paulo')::time<time '09:00'
  or e.status not in ('queued','active') or e.attempts+1<>d.attempt or e.attempts>=least(s.max_attempts,3)
  or c.status not in ('queued','active') or c.opt_out_at is not null
  or p_channel is null or p_channel not in ('whatsapp','email') or p_content_hash is null or p_content_hash !~ '^[0-9a-f]{64}$'
  or nullif(p_contact_id,'') is null or nullif(p_location_id,'') is null
  or (c.ghl_contact_id is not null and c.ghl_contact_id<>p_contact_id) or (c.ghl_location_id is not null and c.ghl_location_id<>p_location_id)
  or not exists(select 1 from ghl_locations where business_id=d.business_id and ghl_location_id=p_location_id and lifecycle_status='active')
  or exists(select 1 from review_request_events where enrollment_id=e.id and event_type in ('replied','opted_out','review_observed'))
  or exists(select 1 from ghl_events where ghl_location_id=p_location_id and contact_id=p_contact_id and created_at>=s.activated_at and (direction='inbound' or opted_out))
 then return null;end if;
 update customer_contacts set ghl_contact_id=p_contact_id,ghl_location_id=p_location_id,updated_at=p_at where id=c.id;
 update review_message_deliveries set state='dispatching',channel=p_channel,content_hash=p_content_hash,ghl_contact_id=p_contact_id,
  ghl_location_id=p_location_id,dispatch_started_at=p_at,updated_at=p_at where id=d.id;
 return jsonb_build_object('ok',true,'id',d.id);
end $$;

create function public.settle_review_delivery(p_delivery_id uuid,p_lease uuid,p_message_id text,p_conversation_id text,p_at timestamptz default now())
returns jsonb language plpgsql security definer set search_path=public,pg_temp set lock_timeout='3s' as $$
declare d public.review_message_deliveries;a public.customer_accounts;s public.review_request_settings;e public.review_request_enrollments;c public.customer_contacts;
 terminal boolean;paused boolean;next_day date;started timestamptz;
begin
 select * into d from review_message_deliveries where id=p_delivery_id;
 if not found then return null;end if;
 select * into a from customer_accounts where business_id=d.business_id for update;
 select * into d from review_message_deliveries where id=p_delivery_id for update;
 if p_at is null or d.lease is distinct from p_lease then return null;end if;
 if d.state='sent' then
  if d.message_id is distinct from p_message_id or d.conversation_id is distinct from p_conversation_id then raise exception 'review_receipt_conflict';end if;
  return jsonb_build_object('ok',true,'duplicate',true);
 end if;
 if d.state not in ('dispatching','ambiguous') or nullif(p_message_id,'') is null or length(p_message_id)>200 then return null;end if;
 select * into s from review_request_settings where business_id=d.business_id for update;
 select * into e from review_request_enrollments where id=d.enrollment_id and business_id=d.business_id for update;
 select * into c from customer_contacts where id=d.contact_id and business_id=d.business_id for update;
 if e.id is null or c.id is null or e.contact_id<>c.id then raise exception 'review_receipt_scope_refused';end if;
 terminal=e.status in ('completed','opted_out','failed') or c.status in ('completed','opted_out','invalid') or c.opt_out_at is not null or d.attempt>=least(s.max_attempts,3);
 paused=coalesce(a.payment_status<>'active',true) or coalesce(s.status<>'active',true) or e.status='paused';
 if not terminal and not paused then
  select min(sent_at) into started from review_message_deliveries where enrollment_id=e.id and state='sent';
  next_day=greatest(((coalesce(started,p_at) at time zone 'America/Sao_Paulo')::date+coalesce(s.reminder_day_offsets[d.attempt+1],7)),(p_at at time zone 'America/Sao_Paulo')::date+1);
  while extract(isodow from next_day)>5 loop next_day=next_day+1;end loop;
 end if;
 insert into review_request_events(business_id,enrollment_id,contact_id,channel,event_type,provider,external_id,metadata,created_at)
  values(d.business_id,e.id,c.id,d.channel,'sent','highlevel',p_message_id,jsonb_build_object('deliveryId',d.id,'attempt',d.attempt,'conversation_id',p_conversation_id),p_at);
 update review_message_deliveries set state='sent',message_id=p_message_id,conversation_id=p_conversation_id,sent_at=p_at,error_code=null,updated_at=p_at where id=d.id;
 update review_request_enrollments set attempts=greatest(attempts,d.attempt),current_step=greatest(current_step,d.attempt),last_sent_at=p_at,
  status=case when c.opt_out_at is not null or c.status='opted_out' or e.status='opted_out' then 'opted_out' when e.status='failed' then 'failed' when terminal then 'completed' when paused then 'paused' else 'active' end,
  next_run_at=case when terminal or paused then null else (next_day+time '09:00') at time zone 'America/Sao_Paulo' end,
  completed_at=case when terminal then coalesce(completed_at,p_at) else completed_at end,updated_at=p_at where id=e.id;
 update customer_contacts set status=case when c.opt_out_at is not null or c.status='opted_out' or e.status='opted_out' then 'opted_out' when c.status='invalid' then 'invalid' when terminal then 'completed' else 'active' end,updated_at=p_at where id=c.id;
 return jsonb_build_object('ok',true,'duplicate',false);
end $$;

create function public.fail_review_delivery(p_delivery_id uuid,p_lease uuid,p_error text,p_at timestamptz default now())
returns boolean language plpgsql security definer set search_path=public,pg_temp set lock_timeout='3s' as $$
declare bid uuid;
begin
 if p_at is null or p_error is null or p_error not in ('preparation_unavailable','provider_response_unknown','receipt_not_saved','provider_scope_refused') then raise exception 'review_failure_code_invalid';end if;
 select business_id into bid from review_message_deliveries where id=p_delivery_id;
 perform 1 from customer_accounts where business_id=bid for update;
 update review_message_deliveries set state=case when state='dispatching' then 'ambiguous' else state end,
  error_code=p_error,available_at=p_at+interval '5 minutes',lease_until=p_at,updated_at=p_at
  where id=p_delivery_id and lease=p_lease and state in ('reserved','dispatching');
 return found;
end $$;

create function public.stop_review_contact(p_business_id uuid,p_contact_id uuid,p_type text,p_message_id text,p_channel text,p_at timestamptz default now())
returns jsonb language plpgsql security definer set search_path=public,pg_temp set lock_timeout='3s' as $$
declare c public.customer_contacts;e public.review_request_enrollments;opted boolean;
begin
 if p_at is null or p_type is null or p_channel is null or p_type not in ('replied','opted_out','review_observed') or p_channel not in ('whatsapp','email','system') or nullif(p_message_id,'') is null then raise exception 'review_stop_identity_required';end if;
 perform 1 from customer_accounts where business_id=p_business_id for update;
 select * into c from customer_contacts where id=p_contact_id and business_id=p_business_id for update;
 if not found then raise exception 'review_contact_scope_refused';end if;
 select * into e from review_request_enrollments where contact_id=c.id and business_id=p_business_id for update;
 opted=p_type='opted_out' or c.opt_out_at is not null or c.status='opted_out';
 update customer_contacts set status=case when opted then 'opted_out' else 'completed' end,opt_out_at=case when opted then coalesce(opt_out_at,p_at) else opt_out_at end,updated_at=p_at where id=c.id;
 if e.id is not null then
  if not exists(select 1 from review_request_events where enrollment_id=e.id and event_type=p_type and provider='highlevel' and external_id=p_message_id) then
   insert into review_request_events(business_id,enrollment_id,contact_id,channel,event_type,provider,external_id,created_at)
    values(p_business_id,e.id,c.id,p_channel,p_type,'highlevel',p_message_id,p_at);
  end if;
  update review_request_enrollments set status=case when opted then 'opted_out' else 'completed' end,next_run_at=null,completed_at=coalesce(completed_at,p_at),updated_at=p_at where id=e.id;
  update review_message_deliveries set state=case when state='reserved' then 'cancelled' else 'ambiguous' end,error_code='stopped_before_or_during_dispatch',updated_at=p_at
   where enrollment_id=e.id and state in ('reserved','dispatching');
 end if;
 return jsonb_build_object('ok',true,'stopped',true);
end $$;

revoke all on function public.claim_review_delivery(uuid,timestamptz),public.begin_review_delivery(uuid,uuid,text,text,text,text,timestamptz),public.settle_review_delivery(uuid,uuid,text,text,timestamptz),public.fail_review_delivery(uuid,uuid,text,timestamptz),public.stop_review_contact(uuid,uuid,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.claim_review_delivery(uuid,timestamptz),public.begin_review_delivery(uuid,uuid,text,text,text,text,timestamptz),public.settle_review_delivery(uuid,uuid,text,text,timestamptz),public.fail_review_delivery(uuid,uuid,text,timestamptz),public.stop_review_contact(uuid,uuid,text,text,text,timestamptz) to service_role;

create function public.claim_next_review_delivery(p_at timestamptz default now())
returns jsonb language plpgsql security definer set search_path=public,pg_temp set lock_timeout='3s' as $$
declare bid uuid;job jsonb;
begin
 if p_at is null then return null;end if;
 -- Lock order stays account -> settings inside claim_review_delivery.
 for bid in select s.business_id from review_request_settings s join customer_accounts a on a.business_id=s.business_id
  where s.status='active' and a.payment_status='active' order by s.delivery_checked_at,s.business_id limit 10 loop
  job=claim_review_delivery(bid,p_at);if job is not null then return job;end if;
 end loop;
 return null;
end $$;
create function public.review_delivery_health(p_at timestamptz default now())
returns jsonb language sql security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('pending',count(*) filter(where state in ('reserved','dispatching','ambiguous')),
  'blocked',count(*) filter(where state='ambiguous' or (state='dispatching' and lease_until<=p_at))) from review_message_deliveries
$$;
revoke all on function public.claim_next_review_delivery(timestamptz),public.review_delivery_health(timestamptz) from public,anon,authenticated;
grant execute on function public.claim_next_review_delivery(timestamptz),public.review_delivery_health(timestamptz) to service_role;
