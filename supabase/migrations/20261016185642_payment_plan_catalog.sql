-- Refuse to overwrite a concurrent financial hotfix. Values are hashes of normalized function bodies.
do $$
declare expected record;actual text;
begin
 for expected in select * from (values
  ('reserve_payment_checkout','d8a628cf06475e88366d489f2cb4d006'),
  ('resolve_payment_checkout','3a2f65a74864067b8e89f363a4e2b065'),
  ('complete_payment_activation','8bc174abbfc41b91d58759cf8104d3c7'),
  ('queue_opendots_customer_lifecycle','c54e8e8acc9503866088d542221e5d90')
 ) x(name,hash) loop
  select md5(regexp_replace(prosrc,'\s','','g')) into actual from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=expected.name;
  if actual is distinct from expected.hash then raise exception 'payment_plan_baseline_changed: %',expected.name;end if;
 end loop;
end $$;

-- Register approved plans without opening checkout or altering legacy subscriptions.
create table public.payment_plan_catalog (
 id text primary key, name text not null, amount_cents integer not null check(amount_cents>0),
 payment_link_id text not null unique, cycle text not null default 'MONTHLY' check(cycle='MONTHLY'),
 checkout_enabled boolean not null default false
);
alter table public.payment_plan_catalog enable row level security;
revoke all on public.payment_plan_catalog from public,anon,authenticated;
grant select on public.payment_plan_catalog to service_role;
insert into public.payment_plan_catalog(id,name,amount_cents,payment_link_id) values
 ('legacy_397','MeuLocal legado',39700,'lay9mi0r83n79lzn'),
 ('essencial','Essencial',18900,'hkztixnoy3z2jxn0'),
 ('inteligencia','Inteligência',28900,'71k8chmbik8gy1ph');
alter table public.payment_checkouts add column plan_id text not null default 'legacy_397' references public.payment_plan_catalog(id),add column payment_link_id text;
alter table public.customer_accounts add column plan_id text not null default 'legacy_397' references public.payment_plan_catalog(id);

create function public.reserve_plan_checkout(p_business_id uuid,p_lead_id uuid,p_name text,p_email text,p_phone text,p_plan_id text) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare p payment_plan_catalog;r jsonb;c payment_checkouts;
begin
 select * into p from payment_plan_catalog where id=p_plan_id and id in ('essencial','inteligencia');
 if not found then raise exception 'payment_plan_invalid';end if;
 if not p.checkout_enabled then raise exception 'payment_plan_not_released';end if;
 -- Reuse the existing account/lead locks and anti-duplicate reservation. The price
 -- is changed inside this same transaction, before any provider operation.
 r=reserve_payment_checkout(p_business_id,p_lead_id,p_name,p_email,p_phone,39700);
 if r->>'state' in ('create','ready','reconcile') then
  select * into c from payment_checkouts where business_id=p_business_id and provider='asaas' and status='created' order by created_at desc limit 1 for update;
  if r->>'state'='create' then
   update payment_checkouts set plan_id=p.id,payment_link_id=null,amount_cents=p.amount_cents,billing_type='CREDIT_CARD' where id=c.id;
  elsif c.plan_id<>p.id or c.amount_cents<>p.amount_cents then raise exception 'payment_checkout_plan_conflict';end if;
 end if;
 return r||jsonb_build_object('planId',p.id,'planName',p.name,'amountCents',p.amount_cents,'cycle',p.cycle);
end $$;
revoke all on function public.reserve_plan_checkout(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.reserve_plan_checkout(uuid,uuid,text,text,text,text) to service_role;

create or replace function public.resolve_payment_checkout(p_event_id uuid,p_shared_link_id text,p_payer_email text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.payment_events; c public.payment_checkouts; a public.customer_accounts;
 plan public.payment_plan_catalog; binding public.payment_provider_bindings; target_lead public.leads; ids uuid[]; mail citext; amount numeric;
begin
 select * into e from payment_events where id=p_event_id for update;
 if not found or e.provider<>'asaas' then raise exception 'payment_event_missing'; end if;
 if e.activation_state='legacy' then raise exception 'legacy_payment_reconciliation_required'; end if;
 if e.external_payment_id is not null then
  perform pg_advisory_xact_lock(hashtextextended('asaas-payment:'||e.external_payment_id,0));
  select * into binding from payment_provider_bindings where provider='asaas' and external_payment_id=e.external_payment_id;
 end if;
 if e.activation_checkout_id is not null then select * into c from payment_checkouts where id=e.activation_checkout_id;
 elsif binding.checkout_id is not null then select * into c from payment_checkouts where id=binding.checkout_id;
 else
  select array_agg(id) into ids from (select id from payment_checkouts where provider='asaas' and
   ((e.external_reference is not null and external_reference=e.external_reference)
    or (e.external_checkout_id is not null and external_checkout_id=e.external_checkout_id)
    or (e.external_subscription_id is not null and external_subscription_id=e.external_subscription_id)) limit 2) matches;
  if cardinality(ids)>1 then raise exception 'payment_checkout_ambiguous'; end if;
  if cardinality(ids)=1 then select * into c from payment_checkouts where id=ids[1]; end if;
 end if;
 if c.id is null then
  if e.event_type not in ('PAYMENT_CONFIRMED','PAYMENT_RECEIVED') or e.external_reference is not null or e.external_checkout_id is not null then raise exception 'payment_checkout_not_matched'; end if;
  if nullif(e.payload->>'paymentLink','') is null then raise exception 'payment_checkout_not_matched'; end if;
  select * into plan from payment_plan_catalog where payment_link_id=e.payload->>'paymentLink';
  if not found then
   if nullif(p_shared_link_id,'') is null or e.payload->>'paymentLink' is distinct from p_shared_link_id then return jsonb_build_object('ignored',true,'reason','unrelated_payment_link');end if;
   select * into plan from payment_plan_catalog where id='legacy_397';
  end if;
  mail=coalesce(nullif(e.payload->>'payerEmail',''),nullif(e.resolved_customer_email::text,''),nullif(p_payer_email,''));
  if mail is null then raise exception 'payment_payer_email_required'; end if;
  if nullif(p_payer_email,'') is not null and lower(mail::text)<>lower(p_payer_email) then raise exception 'payment_payer_email_conflict'; end if;
  select array_agg(id) into ids from (select id from leads where lower(btrim(email))=lower(btrim(mail::text)) limit 2) matches;
  if cardinality(ids) is distinct from 1 then raise exception 'payment_payer_business_ambiguous'; end if;
  select * into target_lead from leads where id=ids[1] for update;
  amount=case when jsonb_typeof(e.payload->'amountCents')='number' then (e.payload->>'amountCents')::numeric else null end;
  if amount is distinct from plan.amount_cents then raise exception 'payment_amount_unverified'; end if;
  if nullif(e.external_payment_id,'') is null then raise exception 'payment_checkout_anchor_required'; end if;
  insert into customer_accounts(business_id,payment_provider) values(target_lead.business_id,'asaas') on conflict(business_id) do nothing;
  select * into a from customer_accounts where business_id=target_lead.business_id for update;
  if plan.id<>'legacy_397' and a.payment_status='active' then raise exception 'payment_existing_contract';end if;
  insert into payment_checkouts(provider,business_id,lead_id,customer_account_id,amount_cents,currency,billing_type,cycle,customer_email,external_subscription_id,plan_id,payment_link_id)
  values('asaas',a.business_id,target_lead.id,a.id,plan.amount_cents,'BRL','SHARED_PAYMENT_LINK','MONTHLY',mail,e.external_subscription_id,plan.id,e.payload->>'paymentLink') returning * into c;
  insert into payment_provider_bindings(provider,external_payment_id,checkout_id,account_id) values('asaas',e.external_payment_id,c.id,a.id);
  update payment_events set resolved_customer_email=mail where id=e.id;
 end if;
 if nullif(e.payload->>'paymentLink','') is not null then
  select * into plan from payment_plan_catalog where payment_link_id=e.payload->>'paymentLink';
  if found and (plan.id<>c.plan_id or plan.amount_cents<>c.amount_cents) then raise exception 'payment_checkout_plan_conflict';end if;
  if not found and c.plan_id<>'legacy_397' then raise exception 'payment_checkout_plan_conflict';end if;
 end if;
 if nullif(e.payload->>'paymentLink','') is not null and c.payment_link_id is not null and e.payload->>'paymentLink' is distinct from c.payment_link_id then raise exception 'payment_checkout_plan_conflict';end if;
 if c.plan_id<>'legacy_397' and (not exists(select 1 from payment_plan_catalog p where p.id=c.plan_id and p.amount_cents=c.amount_cents) or (c.billing_type='SHARED_PAYMENT_LINK' and c.payment_link_id is null)) then raise exception 'payment_checkout_plan_conflict';end if;
 if c.provider<>'asaas' or c.customer_account_id is null
  or (e.external_reference is not null and e.external_reference is distinct from c.external_reference)
  or (e.external_checkout_id is not null and e.external_checkout_id is distinct from c.external_checkout_id)
  or (e.external_subscription_id is not null and c.external_subscription_id is not null and e.external_subscription_id<>c.external_subscription_id)
 then raise exception 'payment_checkout_scope_conflict'; end if;
 select * into a from customer_accounts where id=c.customer_account_id;
 if a.business_id is distinct from c.business_id then raise exception 'payment_checkout_scope_conflict'; end if;
 if a.payment_status='active' and a.external_subscription_id is not null and coalesce(c.external_subscription_id,e.external_subscription_id) is not null and a.external_subscription_id<>coalesce(c.external_subscription_id,e.external_subscription_id) then raise exception 'payment_subscription_superseded'; end if;
 if e.event_type in ('CHECKOUT_PAID','PAYMENT_CONFIRMED','PAYMENT_RECEIVED') then
  amount=case when jsonb_typeof(e.payload->'amountCents')='number' then (e.payload->>'amountCents')::numeric else null end;
  if amount is distinct from c.amount_cents then raise exception 'payment_amount_unverified'; end if;
  if (e.event_type='CHECKOUT_PAID' and e.payload->>'status' is distinct from 'PAID')
   or (e.event_type='PAYMENT_CONFIRMED' and coalesce(e.payload->>'status','') not in ('CONFIRMED','RECEIVED'))
   or (e.event_type='PAYMENT_RECEIVED' and e.payload->>'status' is distinct from 'RECEIVED') then raise exception 'payment_status_unverified'; end if;
 end if;
 update payment_events set activation_checkout_id=c.id where id=e.id;
 return jsonb_build_object('checkoutId',c.id);
end $$;

-- Preserve activation atomicity and make the plan available before lifecycle triggers run.
create or replace function public.complete_payment_activation(p_event_id uuid,p_lease uuid,p_user_id uuid,p_activation_status text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.payment_events; c public.payment_checkouts; a public.customer_accounts; l public.payment_activation_leases;
begin
 if p_activation_status is null or p_activation_status not in ('linked','invited') or p_user_id is null then raise exception 'payment_user_scope_conflict'; end if;
 select * into e from payment_events where id=p_event_id for update;
 if not found then raise exception 'payment_activation_lease_expired'; end if;
 if e.activation_state='completed' and e.activation_lease=p_lease and e.activation_user_id=p_user_id then return true; end if;
 select * into c from payment_checkouts where id=e.activation_checkout_id;
 select * into a from customer_accounts where id=c.customer_account_id for update;
 select * into l from payment_activation_leases where account_id=a.id;
 if e.activation_state<>'processing' or e.activation_lease is distinct from p_lease or l.lease is distinct from p_lease
  or l.event_id is distinct from e.id or l.leased_until is null or l.leased_until<=now() then raise exception 'payment_activation_lease_expired'; end if;
 if a.business_id is distinct from c.business_id or (a.user_id is not null and a.user_id<>p_user_id)
  or exists(select 1 from customer_accounts where user_id=p_user_id and id<>a.id)
  or not exists(select 1 from auth.users u where u.id=p_user_id and (a.user_id=p_user_id or lower(u.email)=lower(c.customer_email::text)))
 then raise exception 'payment_user_scope_conflict'; end if;
 if c.plan_id<>'legacy_397' and not exists(select 1 from payment_plan_catalog p where p.id=c.plan_id and p.amount_cents=c.amount_cents) then raise exception 'payment_checkout_plan_conflict';end if;
 update payment_checkouts set status='paid',paid_at=coalesce(paid_at,now()),activation_status=p_activation_status,activation_error=null,
  external_subscription_id=coalesce(external_subscription_id,e.external_subscription_id),updated_at=now() where id=c.id;
 update customer_accounts set plan_id=c.plan_id,user_id=p_user_id,payment_status='active',payment_provider='asaas',paid_at=coalesce(paid_at,now()),
  external_subscription_id=coalesce(c.external_subscription_id,e.external_subscription_id,external_subscription_id),updated_at=now() where id=a.id;
 update payment_events set activation_state='completed',activation_user_id=p_user_id,activation_error=null,processed_at=now() where id=e.id;
 delete from payment_activation_leases where account_id=a.id and event_id=e.id and lease=p_lease;
 return true;
end $$;

create or replace function public.queue_opendots_customer_lifecycle() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.customer_accounts; c public.payment_checkouts; transition text; eid text; at timestamptz; step text;
begin
 if tg_table_name='customer_accounts' then
  a=new;
  if tg_op='UPDATE' and new.onboarding_status is distinct from old.onboarding_status then transition='onboarding.'||new.onboarding_status; end if;
 else
  select * into a from customer_accounts where id=new.customer_account_id;
 end if;
 -- Never interpret a payment event or an unlinked invitation as completed access.
 if a.id is null or a.payment_status<>'active' or a.user_id is null or a.paid_at is null then return new; end if;
 select * into c from payment_checkouts where customer_account_id=a.id and business_id=a.business_id and paid_at is not null and status='paid' and activation_status in ('linked','invited') order by paid_at desc limit 1;
 if not found then return new; end if;
 if transition is null then
  transition='payment.confirmed';eid='customer:'||a.id||':paid:'||c.id;at=a.paid_at;
 else
  eid='customer:'||a.id||':onboarding:'||gen_random_uuid();at=now();
 end if;
 step=case when a.onboarding_status='completed' then '/dashboard' else '/onboarding' end;
 insert into opendots_handoffs(event_id,kind,business_id,payload)
 values(eid,'meulocal.customer.lifecycle',a.business_id,jsonb_build_object('version',1,'kind','meulocal.customer.lifecycle','eventId',eid,'businessId',a.business_id,'accountId',a.id,'transition',transition,'planId',c.plan_id,'amountCents',c.amount_cents,'paymentStatus',a.payment_status,'onboardingStatus',a.onboarding_status,'nextPath',step,'occurredAt',at,'permissions',jsonb_build_object('initialSend',false,'autoReply',false,'crmWrite',false))) on conflict(event_id) do nothing;
 return new;
end $$;
revoke all on function public.complete_payment_activation(uuid,uuid,uuid,text),public.resolve_payment_checkout(uuid,text,text),public.queue_opendots_customer_lifecycle() from public,anon,authenticated;
grant execute on function public.complete_payment_activation(uuid,uuid,uuid,text),public.resolve_payment_checkout(uuid,text,text) to service_role;
