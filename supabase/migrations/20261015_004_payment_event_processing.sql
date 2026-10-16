alter table public.payment_events
 add column resolved_customer_email citext,
 add column activation_outcome text check(activation_outcome in ('activated','updated','ignored'));
create index payment_events_activation_due on public.payment_events(activation_available_at,created_at) where activation_state in ('pending','processing');
create function public.mark_payment_activation_outcome() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
 if new.activation_state='completed' and new.activation_user_id is not null then new.activation_outcome='activated'; end if;
 return new;
end $$;
create trigger payment_activation_outcome before update on public.payment_events for each row execute function public.mark_payment_activation_outcome();
revoke all on function public.mark_payment_activation_outcome() from public,anon,authenticated;

create table public.payment_invitation_requests(
 account_id uuid primary key references public.customer_accounts(id) on delete cascade,
 event_id uuid not null references public.payment_events(id) on delete restrict,
 customer_email citext not null unique,
 requested_at timestamptz not null default now()
);
alter table public.payment_invitation_requests enable row level security;
revoke all on public.payment_invitation_requests from public,anon,authenticated,service_role;
grant select on public.payment_invitation_requests to service_role;

create function public.receive_asaas_event(p_event jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.payment_events; inserted integer;
begin
 if jsonb_typeof(p_event) is distinct from 'object' or jsonb_typeof(p_event->'eventId') is distinct from 'string'
  or length(p_event->>'eventId') not between 1 and 256 or jsonb_typeof(p_event->'eventType') is distinct from 'string'
  or length(p_event->>'eventType') not between 1 and 100 then raise exception 'invalid_payment_event'; end if;
 insert into payment_events(provider,external_event_id,event_type,external_checkout_id,external_subscription_id,external_payment_id,external_reference,payload)
 values('asaas',p_event->>'eventId',p_event->>'eventType',p_event->>'checkoutId',p_event->>'subscriptionId',p_event->>'paymentId',p_event->>'externalReference',p_event)
 on conflict(provider,external_event_id) do nothing;
 get diagnostics inserted=row_count;
 select * into e from payment_events where provider='asaas' and external_event_id=p_event->>'eventId' for update;
 if e.activation_state='legacy' then raise exception 'legacy_payment_reconciliation_required'; end if;
 if e.payload is distinct from p_event then raise exception 'payment_event_payload_conflict'; end if;
 return to_jsonb(e)||jsonb_build_object('duplicate',inserted=0);
end $$;

create function public.ignore_payment_event(p_event_id uuid,p_reason text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update payment_events set activation_state='completed',activation_outcome='ignored',activation_error=left(p_reason,100),processed_at=now()
 where id=p_event_id and provider='asaas' and activation_state='pending' and processed_at is null;
 return found or exists(select 1 from payment_events where id=p_event_id and provider='asaas' and activation_state='completed' and activation_outcome='ignored');
end $$;

create function public.defer_payment_event(p_event_id uuid,p_error text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update payment_events set activation_error=left(p_error,100),activation_available_at=now()+interval '1 minute'
 where id=p_event_id and provider='asaas' and activation_state='pending' and processed_at is null;
 return found;
end $$;

create function public.resolve_payment_checkout(p_event_id uuid,p_shared_link_id text,p_payer_email text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.payment_events; c public.payment_checkouts; a public.customer_accounts;
 binding public.payment_provider_bindings; target_lead public.leads; ids uuid[]; mail citext; amount numeric;
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
  if nullif(p_shared_link_id,'') is null or e.payload->>'paymentLink' is distinct from p_shared_link_id then return jsonb_build_object('ignored',true,'reason','unrelated_payment_link'); end if;
  mail=coalesce(nullif(e.payload->>'payerEmail',''),nullif(e.resolved_customer_email::text,''),nullif(p_payer_email,''));
  if mail is null then raise exception 'payment_payer_email_required'; end if;
  if nullif(p_payer_email,'') is not null and lower(mail::text)<>lower(p_payer_email) then raise exception 'payment_payer_email_conflict'; end if;
  select array_agg(id) into ids from (select id from leads where lower(btrim(email))=lower(btrim(mail::text)) limit 2) matches;
  if cardinality(ids) is distinct from 1 then raise exception 'payment_payer_business_ambiguous'; end if;
  select * into target_lead from leads where id=ids[1] for update;
  amount=case when jsonb_typeof(e.payload->'amountCents')='number' then (e.payload->>'amountCents')::numeric else null end;
  if amount is distinct from 39700 then raise exception 'payment_amount_unverified'; end if;
  if nullif(e.external_payment_id,'') is null then raise exception 'payment_checkout_anchor_required'; end if;
  insert into customer_accounts(business_id,payment_provider) values(target_lead.business_id,'asaas') on conflict(business_id) do nothing;
  select * into a from customer_accounts where business_id=target_lead.business_id for update;
  insert into payment_checkouts(provider,business_id,lead_id,customer_account_id,amount_cents,currency,billing_type,cycle,customer_email,external_subscription_id)
  values('asaas',a.business_id,target_lead.id,a.id,39700,'BRL','SHARED_PAYMENT_LINK','MONTHLY',mail,e.external_subscription_id) returning * into c;
  insert into payment_provider_bindings(provider,external_payment_id,checkout_id,account_id) values('asaas',e.external_payment_id,c.id,a.id);
  update payment_events set resolved_customer_email=mail where id=e.id;
 end if;
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

create function public.authorize_payment_invitation(p_event_id uuid,p_lease uuid,p_email text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.payment_events; c public.payment_checkouts; a public.customer_accounts; l public.payment_activation_leases;
begin
 select * into e from payment_events where id=p_event_id for update;
 select * into c from payment_checkouts where id=e.activation_checkout_id;
 select * into a from customer_accounts where id=c.customer_account_id for update;
 select * into l from payment_activation_leases where account_id=a.id;
 if e.activation_state is distinct from 'processing' or e.activation_lease is distinct from p_lease
  or l.lease is distinct from p_lease or l.event_id is distinct from e.id or l.leased_until is null or l.leased_until<=now()
 then raise exception 'payment_activation_lease_expired'; end if;
 if a.user_id is not null or a.business_id is distinct from c.business_id or lower(p_email) is distinct from lower(c.customer_email::text) then return false; end if;
 if exists(select 1 from auth.users where lower(email)=lower(p_email)) then return false; end if;
 -- Persist BEFORE the external call. A lost response never permits a blind second invitation.
 insert into payment_invitation_requests(account_id,event_id,customer_email) values(a.id,e.id,p_email) on conflict do nothing;
 return found;
end $$;

create function public.apply_payment_status(p_event_id uuid,p_checkout_id uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.payment_events; c public.payment_checkouts; a public.customer_accounts; l public.payment_activation_leases;
begin
 select * into e from payment_events where id=p_event_id for update;
 if not found or e.provider<>'asaas' or e.activation_checkout_id is distinct from p_checkout_id then raise exception 'payment_checkout_scope_conflict'; end if;
 if e.activation_state='completed' then return true; end if;
 if e.activation_state='legacy' or e.processed_at is not null then raise exception 'legacy_payment_reconciliation_required'; end if;
 select * into c from payment_checkouts where id=p_checkout_id;
 select * into a from customer_accounts where id=c.customer_account_id for update;
 if not found or a.business_id is distinct from c.business_id then raise exception 'payment_checkout_scope_conflict'; end if;
 select * into l from payment_activation_leases where account_id=a.id;
 if found and l.leased_until>now() then return false; end if;
 if a.external_subscription_id is not null and e.external_subscription_id is not null and a.external_subscription_id<>e.external_subscription_id then raise exception 'payment_subscription_superseded'; end if;
 if e.event_type in ('CHECKOUT_CANCELED','SUBSCRIPTION_INACTIVATED','SUBSCRIPTION_DELETED') then
  update payment_checkouts set status='canceled',updated_at=now() where id=c.id;
  update customer_accounts set payment_status='canceled',updated_at=now() where id=a.id;
 elsif e.event_type='CHECKOUT_EXPIRED' then
  if c.status<>'paid' then update payment_checkouts set status='expired',updated_at=now() where id=c.id; end if;
 elsif e.event_type='PAYMENT_OVERDUE' then
  if not exists(select 1 from payment_events where provider='asaas' and external_payment_id=e.external_payment_id and activation_outcome='activated' and activation_state='completed') then
   update customer_accounts set payment_status='past_due',updated_at=now() where id=a.id;
  end if;
 elsif e.event_type='SUBSCRIPTION_CREATED' and e.external_subscription_id is not null then
  update payment_checkouts set external_subscription_id=e.external_subscription_id,updated_at=now() where id=c.id;
  update customer_accounts set payment_provider='asaas',external_subscription_id=e.external_subscription_id,updated_at=now() where id=a.id;
 else raise exception 'payment_event_not_supported'; end if;
 update payment_events set activation_state='completed',activation_outcome='updated',processed_at=now(),activation_error=null where id=e.id;
 return true;
end $$;

revoke all on function public.receive_asaas_event(jsonb),public.ignore_payment_event(uuid,text),public.defer_payment_event(uuid,text),public.resolve_payment_checkout(uuid,text,text),public.authorize_payment_invitation(uuid,uuid,text),public.apply_payment_status(uuid,uuid) from public,anon,authenticated;
grant execute on function public.receive_asaas_event(jsonb),public.ignore_payment_event(uuid,text),public.defer_payment_event(uuid,text),public.resolve_payment_checkout(uuid,text,text),public.authorize_payment_invitation(uuid,uuid,text),public.apply_payment_status(uuid,uuid) to service_role;
