-- Additive durable activation. Receipt, account, checkout and lifecycle queue commit together.
alter table public.payment_events
 add column activation_state text not null default 'pending' check(activation_state in ('pending','processing','completed','legacy')),
 add column activation_checkout_id uuid references public.payment_checkouts(id) on delete restrict,
 add column activation_lease uuid,
 add column activation_attempts integer not null default 0,
 add column activation_available_at timestamptz not null default now(),
 add column activation_error text,
 add column activation_user_id uuid references auth.users(id) on delete restrict;
-- Historical processed_at was not proof of access. Never silently certify old partial work.
update public.payment_events set activation_state='legacy' where processed_at is not null;

create table public.payment_activation_leases(
 account_id uuid primary key references public.customer_accounts(id) on delete cascade,
 event_id uuid not null unique references public.payment_events(id) on delete cascade,
 lease uuid not null,
 leased_until timestamptz not null
);
create table public.payment_provider_bindings(
 provider text not null check(provider='asaas'),
 external_payment_id text not null,
 checkout_id uuid not null references public.payment_checkouts(id) on delete restrict,
 account_id uuid not null references public.customer_accounts(id) on delete restrict,
 primary key(provider,external_payment_id)
);
alter table public.payment_activation_leases enable row level security;
alter table public.payment_provider_bindings enable row level security;
revoke all on public.payment_activation_leases,public.payment_provider_bindings from public,anon,authenticated,service_role;
grant select on public.payment_activation_leases,public.payment_provider_bindings to service_role;

create function public.claim_payment_activation(p_event_id uuid,p_checkout_id uuid,p_shared_link_id text default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.payment_events; c public.payment_checkouts; a public.customer_accounts;
 l public.payment_activation_leases; binding public.payment_provider_bindings; token uuid;
begin
 select * into e from payment_events where id=p_event_id for update;
 if not found or e.provider<>'asaas' or e.event_type not in ('CHECKOUT_PAID','PAYMENT_CONFIRMED','PAYMENT_RECEIVED') then raise exception 'payment_event_not_activatable'; end if;
 select * into c from payment_checkouts where id=p_checkout_id;
 if not found or c.provider<>'asaas' or c.customer_account_id is null then raise exception 'payment_checkout_scope_conflict'; end if;
 select * into a from customer_accounts where id=c.customer_account_id for update;
 if not found or a.business_id<>c.business_id then raise exception 'payment_checkout_scope_conflict'; end if;
 if (e.activation_checkout_id is not null and e.activation_checkout_id<>c.id)
  or (e.external_reference is not null and e.external_reference is distinct from c.external_reference)
  or (e.external_checkout_id is not null and e.external_checkout_id is distinct from c.external_checkout_id)
  or (e.external_subscription_id is not null and c.external_subscription_id is not null and e.external_subscription_id<>c.external_subscription_id)
 then raise exception 'payment_checkout_scope_conflict'; end if;
 if e.external_reference is null and e.external_checkout_id is null and e.external_subscription_id is null then
  if nullif(p_shared_link_id,'') is null or e.payload->>'paymentLink' is distinct from p_shared_link_id
   or nullif(e.external_payment_id,'') is null or c.billing_type is distinct from 'SHARED_PAYMENT_LINK'
   or nullif(coalesce(e.payload->>'payerEmail',to_jsonb(e)->>'resolved_customer_email'),'') is null
   or lower(coalesce(e.payload->>'payerEmail',to_jsonb(e)->>'resolved_customer_email')) is distinct from lower(c.customer_email::text)
  then raise exception 'payment_checkout_anchor_required'; end if;
 end if;
 if e.activation_state='completed' then return jsonb_build_object('state','completed','accountId',a.id,'checkoutId',c.id); end if;
 if e.activation_state='legacy' or e.processed_at is not null then raise exception 'legacy_payment_reconciliation_required'; end if;
 if e.activation_available_at>now() then return null; end if;
 select * into l from payment_activation_leases where account_id=a.id;
 if found and l.leased_until>now() then return null; end if;
 if e.external_payment_id is not null then
  insert into payment_provider_bindings(provider,external_payment_id,checkout_id,account_id)
   values('asaas',e.external_payment_id,c.id,a.id) on conflict do nothing;
  select * into binding from payment_provider_bindings where provider='asaas' and external_payment_id=e.external_payment_id;
  if binding.checkout_id<>c.id or binding.account_id<>a.id then raise exception 'payment_provider_binding_conflict'; end if;
 end if;
 token=gen_random_uuid();
 insert into payment_activation_leases(account_id,event_id,lease,leased_until) values(a.id,e.id,token,now()+interval '2 minutes')
  on conflict(account_id) do update set event_id=excluded.event_id,lease=excluded.lease,leased_until=excluded.leased_until;
 update payment_events set activation_state='processing',activation_checkout_id=c.id,activation_lease=token,
  activation_attempts=activation_attempts+1,activation_error=null where id=e.id;
 return jsonb_build_object('state','processing','lease',token,'account',to_jsonb(a),'checkout',to_jsonb(c));
end $$;

create function public.release_payment_activation(p_event_id uuid,p_lease uuid,p_error text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.payment_events; a public.customer_accounts; c public.payment_checkouts;
begin
 select * into e from payment_events where id=p_event_id for update;
 if not found or e.activation_state<>'processing' or e.activation_lease is distinct from p_lease then return false; end if;
 select * into c from payment_checkouts where id=e.activation_checkout_id;
 select * into a from customer_accounts where id=c.customer_account_id for update;
 delete from payment_activation_leases where account_id=a.id and event_id=e.id and lease=p_lease;
 update payment_events set activation_state='pending',activation_lease=null,activation_error=left(p_error,100),
  activation_available_at=now()+interval '1 minute',processed_at=null where id=e.id;
 return true;
end $$;

create function public.complete_payment_activation(p_event_id uuid,p_lease uuid,p_user_id uuid,p_activation_status text) returns boolean
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
 update payment_checkouts set status='paid',paid_at=coalesce(paid_at,now()),activation_status=p_activation_status,activation_error=null,
  external_subscription_id=coalesce(external_subscription_id,e.external_subscription_id),updated_at=now() where id=c.id;
 update customer_accounts set user_id=p_user_id,payment_status='active',payment_provider='asaas',paid_at=coalesce(paid_at,now()),
  external_subscription_id=coalesce(c.external_subscription_id,e.external_subscription_id,external_subscription_id),updated_at=now() where id=a.id;
 update payment_events set activation_state='completed',activation_user_id=p_user_id,activation_error=null,processed_at=now() where id=e.id;
 delete from payment_activation_leases where account_id=a.id and event_id=e.id and lease=p_lease;
 return true;
end $$;

revoke all on function public.claim_payment_activation(uuid,uuid,text),public.release_payment_activation(uuid,uuid,text),public.complete_payment_activation(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_payment_activation(uuid,uuid,text),public.release_payment_activation(uuid,uuid,text),public.complete_payment_activation(uuid,uuid,uuid,text) to service_role;
