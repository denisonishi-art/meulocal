-- Draft: prepare a direct buyer identity without a Google diagnostic.
-- No payment or sending is performed in this function.
create table public.direct_checkout_identity (
 id uuid primary key default gen_random_uuid(),
 identity_key text not null unique,
 business_id uuid not null references public.businesses(id),
 lead_id uuid not null references public.leads(id),
 created_at timestamptz not null default now()
);
alter table public.direct_checkout_identity enable row level security;
revoke all on public.direct_checkout_identity from public,anon,authenticated;

create function public.prepare_direct_checkout(p_business_name text,p_city text,p_name text,p_email text,p_phone text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp set lock_timeout='3s' as $$
declare k text; existing public.direct_checkout_identity; b uuid; l uuid; normalized_email text;
begin
 normalized_email=lower(btrim(coalesce(p_email,'')));
 if length(btrim(coalesce(p_business_name,''))) not between 2 and 200
 or length(btrim(coalesce(p_city,''))) not between 2 and 120
 or length(btrim(coalesce(p_name,''))) not between 2 and 200
 or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+
 or length(normalized_email)>320 or length(coalesce(p_phone,''))>40
 then raise exception 'direct_checkout_invalid'; end if;
 k=encode(digest(normalized_email||'|'||lower(btrim(p_business_name))||'|'||lower(btrim(p_city)),'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('meulocal.directcheckout:'||k,0));
 select * into existing from public.direct_checkout_identity where identity_key=k;
 if found then
  if not exists(select 1 from public.leads where id=existing.lead_id and business_id=existing.business_id and lower(btrim(email))=normalized_email)
    then raise exception 'direct_checkout_binding_conflict'; end if;
  return jsonb_build_object('businessId',existing.business_id,'leadId',existing.lead_id);
 end if;
 insert into public.businesses(name,city,source,status)
 values(btrim(p_business_name),btrim(p_city),'inbound','new') returning id into b;
 insert into public.leads(business_id,name,email,whatsapp,consent_email,consent_whatsapp,origin)
 values(b,btrim(p_name),normalized_email,nullif(btrim(coalesce(p_phone,'')),''),false,false,'direct_checkout')
 returning id into l;
 insert into public.direct_checkout_identity(identity_key,business_id,lead_id) values(k,b,l);
 return jsonb_build_object('businessId',b,'leadId',l);
end $$;
revoke all on function public.prepare_direct_checkout(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.prepare_direct_checkout(text,text,text,text,text) to service_role;

 or length(normalized_email)>320 or length(coalesce(p_phone,''))>40
 then raise exception 'direct_checkout_invalid'; end if;
 k=encode(digest(normalized_email||'|'||lower(btrim(p_business_name))||'|'||lower(btrim(p_city)),'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('meulocal.directcheckout:'||k,0));
 select * into existing from public.direct_checkout_identity where identity_key=k;
 if found then
  if not exists(select 1 from public.leads where id=existing.lead_id and business_id=existing.business_id and lower(btrim(email))=normalized_email)
    then raise exception 'direct_checkout_binding_conflict'; end if;
  return jsonb_build_object('businessId',existing.business_id,'leadId',existing.lead_id);
 end if;
 insert into public.businesses(name,city,source,status)
 values(btrim(p_business_name),btrim(p_city),'inbound','new') returning id into b;
 insert into public.leads(business_id,name,email,whatsapp,consent_email,consent_whatsapp,origin)
 values(b,btrim(p_name),normalized_email,nullif(btrim(coalesce(p_phone,'')),''),false,false,'direct_checkout')
 returning id into l;
 insert into public.direct_checkout_identity(identity_key,business_id,lead_id) values(k,b,l);
 return jsonb_build_object('businessId',b,'leadId',l);
end $$;
revoke all on function public.prepare_direct_checkout(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.prepare_direct_checkout(text,text,text,text,text) to service_role;
