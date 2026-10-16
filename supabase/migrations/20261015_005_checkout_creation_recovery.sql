-- Persist financial intent before the external request. Unknown results require reconciliation.
alter table public.payment_checkouts
 add column creation_state text not null default 'legacy' check(creation_state in ('legacy','requested','unknown','ready')),
 add column creation_lease uuid,
 add column creation_error text;

create or replace function public.reserve_payment_checkout(p_business_id uuid,p_lead_id uuid,p_name text,p_email text,p_phone text,p_amount_cents integer)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.customer_accounts;c public.payment_checkouts;l public.leads;token uuid;
begin
 if p_amount_cents<>39700 then raise exception 'payment_checkout_amount_conflict';end if;
 if nullif(btrim(p_name),'') is null or length(p_name)>200 or length(p_email)>320 or length(p_phone)>40 then raise exception 'payment_checkout_customer_conflict';end if;
 select * into l from leads where id=p_lead_id and business_id=p_business_id for update;
 if not found or nullif(btrim(p_email),'') is null or lower(btrim(l.email)) is distinct from lower(btrim(p_email)) then raise exception 'payment_checkout_customer_conflict';end if;
 insert into customer_accounts(business_id,payment_provider) values(p_business_id,'asaas') on conflict(business_id) do nothing;
 select * into a from customer_accounts where business_id=p_business_id for update;
 if a.payment_status='active' then return jsonb_build_object('state','active');end if;
 if a.payment_status<>'canceled' and (a.payment_status='past_due' or a.external_subscription_id is not null) then return jsonb_build_object('state','existing_contract');end if;
 if exists(select 1 from payment_checkouts where business_id=p_business_id and status='paid' and activation_status is distinct from 'linked' and activation_status is distinct from 'invited') then return jsonb_build_object('state','payment_processing');end if;
 -- Even an unprocessed confirmed event blocks a second purchase for this account.
 if exists(select 1 from payment_events e join payment_checkouts pc on pc.id=e.activation_checkout_id or pc.external_reference=e.external_reference or pc.external_checkout_id=e.external_checkout_id
  where pc.business_id=p_business_id and e.event_type in ('CHECKOUT_PAID','PAYMENT_CONFIRMED','PAYMENT_RECEIVED') and e.activation_state in ('pending','processing')) then return jsonb_build_object('state','payment_processing');end if;
 select * into c from payment_checkouts where business_id=p_business_id and provider='asaas' and status='created' order by created_at desc limit 1 for update;
 if found then
  if lower(c.customer_email::text) is distinct from lower(btrim(p_email)) then raise exception 'payment_checkout_customer_conflict';end if;
  if c.checkout_url is not null and c.external_checkout_id is not null then return jsonb_build_object('state','ready','checkoutUrl',c.checkout_url);end if;
  return jsonb_build_object('state','reconcile','checkoutId',c.id);
 end if;
 token=gen_random_uuid();
 insert into payment_checkouts(provider,business_id,lead_id,customer_account_id,external_reference,amount_cents,currency,billing_type,cycle,customer_name,customer_email,customer_phone,creation_state,creation_lease)
 values('asaas',p_business_id,p_lead_id,a.id,gen_random_uuid()::text,p_amount_cents,'BRL','CREDIT_CARD_OR_PIX','MONTHLY',btrim(p_name),lower(btrim(p_email)),nullif(btrim(p_phone),''),'requested',token) returning * into c;
 return jsonb_build_object('state','create','checkoutId',c.id,'reference',c.external_reference,'lease',token);
end $$;

create or replace function public.finish_payment_checkout(p_checkout_id uuid,p_lease uuid,p_provider_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.payment_checkouts;url text;
begin
 select * into c from payment_checkouts where id=p_checkout_id for update;
 if not found or c.creation_lease is distinct from p_lease or p_lease is null then raise exception 'payment_checkout_lease_conflict';end if;
 if p_provider_id is null or p_provider_id !~ '^[A-Za-z0-9_-]{1,200}$' then raise exception 'payment_checkout_identity_conflict';end if;
 if c.external_checkout_id is not null and c.external_checkout_id<>p_provider_id then raise exception 'payment_checkout_identity_conflict';end if;
 url='https://asaas.com/checkoutSession/show?id='||p_provider_id;
 update payment_checkouts set external_checkout_id=p_provider_id,checkout_url=url,creation_state='ready',creation_error=null,updated_at=now() where id=c.id;
 return jsonb_build_object('checkoutUrl',url);
end $$;

create or replace function public.defer_checkout_creation(p_checkout_id uuid,p_lease uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update payment_checkouts set creation_state='unknown',creation_error='provider_result_requires_reconciliation',updated_at=now()
 where id=p_checkout_id and creation_lease=p_lease and creation_state='requested';
 return found;
end $$;

revoke all on function public.reserve_payment_checkout(uuid,uuid,text,text,text,integer),public.finish_payment_checkout(uuid,uuid,text),public.defer_checkout_creation(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reserve_payment_checkout(uuid,uuid,text,text,text,integer),public.finish_payment_checkout(uuid,uuid,text),public.defer_checkout_creation(uuid,uuid) to service_role;

-- Checkout notifications may arrive before the create request's HTTP response.
-- Without a known provider ID or an exact locally persisted reference, do not infer a tenant.
create or replace function public.bind_payment_checkout_event(p_event_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.payment_events;c public.payment_checkouts;ids uuid[];
begin
 select * into e from payment_events where id=p_event_id for update;
 if not found or e.provider<>'asaas' or e.event_type not in ('CHECKOUT_CREATED','CHECKOUT_PAID','CHECKOUT_CANCELED','CHECKOUT_EXPIRED') then raise exception 'payment_checkout_scope_conflict';end if;
 if e.activation_state='completed' then return true;end if;
 if e.activation_state='legacy' then raise exception 'legacy_payment_reconciliation_required';end if;
 select array_agg(id) into ids from (select id from payment_checkouts where provider='asaas' and
  (external_checkout_id=e.external_checkout_id or (e.external_reference is not null and external_reference=e.external_reference)) limit 2) matches;
 if cardinality(ids)>1 then raise exception 'payment_checkout_ambiguous';end if;
 if cardinality(ids) is distinct from 1 then raise exception 'payment_checkout_not_matched';end if;
 select * into c from payment_checkouts where id=ids[1] for update;
 if e.external_reference is not null and e.external_reference is distinct from c.external_reference then raise exception 'payment_checkout_scope_conflict';end if;
 if c.external_checkout_id is not null and c.external_checkout_id is distinct from e.external_checkout_id then raise exception 'payment_checkout_scope_conflict';end if;
 if e.event_type='CHECKOUT_CREATED' and e.payload->>'status' is distinct from 'ACTIVE' then raise exception 'payment_status_unverified';end if;
 if c.external_checkout_id is null or e.event_type='CHECKOUT_CREATED' then
  if (e.payload->>'amountCents')::numeric is distinct from c.amount_cents then raise exception 'payment_amount_unverified';end if;
 end if;
 if c.external_checkout_id is null then
  if c.creation_state not in ('requested','unknown') or c.creation_lease is null or c.external_reference is distinct from e.external_reference then raise exception 'payment_checkout_anchor_required';end if;
  perform finish_payment_checkout(c.id,c.creation_lease,e.external_checkout_id);
 end if;
 if e.event_type='CHECKOUT_CREATED' then
  update payment_events set activation_checkout_id=c.id,activation_state='completed',activation_outcome='updated',processed_at=now(),activation_error=null where id=e.id;
 end if;
 return true;
end $$;
revoke all on function public.bind_payment_checkout_event(uuid) from public,anon,authenticated;
grant execute on function public.bind_payment_checkout_event(uuid) to service_role;
