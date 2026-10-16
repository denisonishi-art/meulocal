-- Existing base tables are preserved. New imports and confirmation commit atomically.
alter table public.customer_imports add column file_hash text;
create unique index customer_imports_file_hash on public.customer_imports(business_id,file_hash) where file_hash is not null;

create or replace function public.normalize_customer_phone(p_phone text)
returns text language sql immutable strict set search_path=public,pg_temp as $$
 select case when length(d) in (10,11) then '55'||d when length(d) in (12,13) and left(d,2)='55' then d else null end
 from (select regexp_replace(p_phone,'[^0-9]','','g') as d) input
$$;
create index customer_contacts_email_identity on public.customer_contacts(business_id,lower(btrim(email))) where email is not null;
create index customer_contacts_phone_identity on public.customer_contacts(business_id,public.normalize_customer_phone(whatsapp)) where whatsapp is not null;

create or replace function public.customer_import_summary(p_import_id uuid)
returns jsonb language sql security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('ok',true,'importId',i.id,'fileName',i.file_name,'totalRows',i.total_rows,
  'validRows',i.valid_rows,'invalidRows',i.invalid_rows,'duplicateRows',i.duplicate_rows,
  'preview',coalesce((select jsonb_agg(jsonb_build_object('name',coalesce(c.name,'Sem nome'),'email',c.email,'whatsapp',c.whatsapp,'lastPurchaseAt',c.last_purchase_at))
   from (select name,email,whatsapp,last_purchase_at from customer_contacts where import_id=i.id and business_id=i.business_id order by created_at,id limit 8) c),'[]'::jsonb))
 from customer_imports i where i.id=p_import_id
$$;

create or replace function public.import_customer_base(p_business_id uuid,p_user_id uuid,p_file_hash text,p_file_name text,p_rows jsonb,p_total_rows integer,p_invalid_rows integer,p_duplicate_rows integer)
returns jsonb language plpgsql security definer set search_path=public,pg_temp set statement_timeout='45s' set lock_timeout='3s' as $$
declare a public.customer_accounts;imp public.customer_imports;r jsonb;mail text;phone text;ck text;fresh integer=0;duplicates integer=0;
begin
 select * into a from customer_accounts where business_id=p_business_id and user_id=p_user_id and payment_status='active' for update;
 if not found then raise exception 'customer_base_access_denied';end if;
 if p_file_hash is null or p_file_hash !~ '^[0-9a-f]{64}$' or nullif(p_file_name,'') is null or length(p_file_name)>255
  or jsonb_typeof(p_rows) is distinct from 'array' or p_total_rows is null or p_invalid_rows is null or p_duplicate_rows is null
  or p_total_rows not between 1 and 10000 or p_invalid_rows<0 or p_duplicate_rows<0
  or jsonb_array_length(p_rows)+p_invalid_rows+p_duplicate_rows<>p_total_rows then raise exception 'customer_import_invalid';end if;
 select * into imp from customer_imports where business_id=p_business_id and file_hash=p_file_hash;
 if found then return customer_import_summary(imp.id);end if;
 insert into customer_imports(business_id,user_id,file_name,status,file_hash,total_rows)
 values(p_business_id,p_user_id,p_file_name,'processing',p_file_hash,p_total_rows) returning * into imp;
 for r in select value from jsonb_array_elements(p_rows) loop
  mail=nullif(lower(btrim(r->>'email')),'');phone=normalize_customer_phone(nullif(r->>'whatsapp',''));
  if (mail is not null and (length(mail)>320 or mail !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))
   or length(r->>'name')>200 or (mail is null and phone is null) then raise exception 'customer_import_invalid';end if;
  ck=case when mail is not null then 'email:'||mail else 'phone:'||phone end;
  if exists(select 1 from customer_contacts where business_id=p_business_id and contact_key=ck)
   or (mail is not null and exists(select 1 from customer_contacts where business_id=p_business_id and email is not null and lower(btrim(email))=mail))
   or (phone is not null and exists(select 1 from customer_contacts where business_id=p_business_id and whatsapp is not null and normalize_customer_phone(whatsapp)=phone))
  then duplicates=duplicates+1;continue;end if;
  insert into customer_contacts(business_id,import_id,name,email,whatsapp,last_purchase_at,contact_key,status)
  values(p_business_id,imp.id,nullif(btrim(r->>'name'),''),mail,phone,nullif(r->>'lastPurchase','')::timestamptz,ck,'imported');
  fresh=fresh+1;
 end loop;
 update customer_imports set status='ready',valid_rows=fresh,invalid_rows=p_invalid_rows,duplicate_rows=p_duplicate_rows+duplicates where id=imp.id;
 return customer_import_summary(imp.id);
end $$;

create or replace function public.confirm_customer_import(p_business_id uuid,p_user_id uuid,p_import_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp set lock_timeout='3s' as $$
declare a public.customer_accounts;imp public.customer_imports;repeated boolean;
begin
 select * into a from customer_accounts where business_id=p_business_id and user_id=p_user_id and payment_status='active' for update;
 if not found then raise exception 'customer_base_access_denied';end if;
 select * into imp from customer_imports where id=p_import_id and business_id=p_business_id for update;
 if not found then raise exception 'customer_import_not_found';end if;
 repeated=imp.status='confirmed';
 if not repeated then
  if imp.status<>'ready' then raise exception 'customer_import_not_ready';end if;
  if (select count(*) from customer_contacts where import_id=imp.id and business_id=p_business_id)<>imp.valid_rows then raise exception 'customer_import_incomplete';end if;
  update customer_contacts set status=case when opt_out_at is null then 'eligible' else 'opted_out' end,updated_at=now()
   where import_id=imp.id and business_id=p_business_id and status='imported';
  update customer_imports set status='confirmed',confirmed_at=now() where id=imp.id returning * into imp;
 end if;
 return jsonb_build_object('ok',true,'alreadyConfirmed',repeated,'summary',jsonb_build_object('id',imp.id,'total_rows',imp.total_rows,'valid_rows',imp.valid_rows,'invalid_rows',imp.invalid_rows,'duplicate_rows',imp.duplicate_rows,'confirmed_at',imp.confirmed_at));
end $$;

revoke all on function public.normalize_customer_phone(text),public.customer_import_summary(uuid),public.import_customer_base(uuid,uuid,text,text,jsonb,integer,integer,integer),public.confirm_customer_import(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.normalize_customer_phone(text),public.customer_import_summary(uuid),public.import_customer_base(uuid,uuid,text,text,jsonb,integer,integer,integer),public.confirm_customer_import(uuid,uuid,uuid) to service_role;
