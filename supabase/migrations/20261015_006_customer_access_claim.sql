-- Resolve an already-paid legacy account using verified Auth identity, under one transaction.
create or replace function public.claim_customer_access(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare mail text;a public.customer_accounts;ids uuid[];
begin
 if p_user_id is null then return jsonb_build_object('state','unauthorized');end if;
 select lower(btrim(email)) into mail from auth.users where id=p_user_id and email_confirmed_at is not null;
 if nullif(mail,'') is null then return jsonb_build_object('state','unauthorized');end if;
 perform pg_advisory_xact_lock(hashtextextended('meulocal-access:'||p_user_id::text,0));
 select * into a from customer_accounts where user_id=p_user_id for update;
 if found then
  if a.payment_status<>'active' then return jsonb_build_object('state','inactive');end if;
  return jsonb_build_object('state','linked','businessId',a.business_id);
 end if;
 select array_agg(business_id) into ids from (select distinct business_id from leads where lower(btrim(email))=mail limit 2) matches;
 if cardinality(ids) is distinct from 1 then return jsonb_build_object('state','not_found');end if;
 select * into a from customer_accounts where business_id=ids[1] for update;
 if not found or a.payment_status<>'active' or a.user_id is not null then return jsonb_build_object('state','inactive');end if;
 update customer_accounts set user_id=p_user_id,updated_at=now() where id=a.id and user_id is null and payment_status='active';
 if not found then return jsonb_build_object('state','inactive');end if;
 return jsonb_build_object('state','linked','businessId',a.business_id);
end $$;
revoke all on function public.claim_customer_access(uuid) from public,anon,authenticated;
grant execute on function public.claim_customer_access(uuid) to service_role;
