-- Explicit account-owned onboarding transitions; never changes payment or sends.
alter table public.customer_accounts add column onboarding_business_confirmed_at timestamptz,add column onboarding_completed_at timestamptz;
create function public.record_customer_onboarding(p_user_id uuid,p_status text,p_business_confirmed boolean default false,p_confirmed boolean default false)
returns jsonb language plpgsql security definer set search_path=public,pg_temp set lock_timeout='3s' as $$
declare a public.customer_accounts;
begin
 if p_status is null or p_status not in ('pending','in_progress','completed') then raise exception 'onboarding_status_invalid';end if;
 select * into a from customer_accounts where user_id=p_user_id for update;
 if not found then raise exception 'onboarding_access_denied';end if;
 if a.payment_status<>'active' then raise exception 'onboarding_payment_required';end if;
 if a.onboarding_status='completed' then return jsonb_build_object('ok',true,'status','completed');end if;
 if p_status='in_progress' and p_business_confirmed is distinct from true then raise exception 'onboarding_business_confirmation_required';end if;
 if p_status='completed' then
  if p_confirmed is distinct from true then raise exception 'onboarding_confirmation_required';end if;
  if a.onboarding_status<>'in_progress' or a.onboarding_business_confirmed_at is null then raise exception 'onboarding_business_confirmation_required';end if;
 end if;
 if not exists(select 1 from businesses where id=a.business_id and length(btrim(name))>0) then raise exception 'onboarding_business_missing';end if;
 update customer_accounts set onboarding_status=p_status,
  onboarding_business_confirmed_at=case when p_status='in_progress' then coalesce(onboarding_business_confirmed_at,now()) else onboarding_business_confirmed_at end,
  onboarding_completed_at=case when p_status='completed' then now() else onboarding_completed_at end,updated_at=now() where id=a.id;
 return jsonb_build_object('ok',true,'status',p_status);
end $$;
revoke all on function public.record_customer_onboarding(uuid,text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.record_customer_onboarding(uuid,text,boolean,boolean) to service_role;
-- Keep the proven queue transaction; prevent direct bypass of final service prerequisites.
alter function public.activate_customer_base(uuid,uuid) rename to queue_customer_base_existing;
revoke all on function public.queue_customer_base_existing(uuid,uuid) from public,anon,authenticated,service_role;
create function public.activate_customer_base(p_business_id uuid,p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp set statement_timeout='45s' set lock_timeout='3s' as $$
declare a public.customer_accounts;
begin
 select * into a from customer_accounts where business_id=p_business_id and user_id=p_user_id and payment_status='active' for update;
 if not found then raise exception 'customer_base_access_denied';end if;
 if a.onboarding_status<>'completed' then raise exception 'customer_base_onboarding_required';end if;
 if not exists(select 1 from ghl_locations where business_id=p_business_id and lifecycle_status='active' and nullif(ghl_location_id,'') is not null) then raise exception 'customer_base_location_required';end if;
 if not exists(select 1 from businesses where id=p_business_id and nullif(btrim(google_place_id),'') is not null)
  and not exists(select 1 from google_business_connections where business_id=p_business_id and status='connected' and google_review_url ~ '^https://([a-zA-Z0-9-]+\.)*google\.com/') then raise exception 'customer_base_review_destination_required';end if;
 return queue_customer_base_existing(p_business_id,p_user_id);
end $$;
revoke all on function public.activate_customer_base(uuid,uuid) from public,anon,authenticated;
grant execute on function public.activate_customer_base(uuid,uuid) to service_role;
