-- Queue preparation only. Delivery requires its own authorization and durable receipt.
create index review_request_enrollments_activation_capacity on public.review_request_enrollments(business_id,activation_date);
create or replace function public.activate_customer_base(p_business_id uuid,p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp set statement_timeout='45s' set lock_timeout='3s' as $$
declare a public.customer_accounts;s public.review_request_settings;c record;day date;start_day date;
 first_day date;last_day date;day_index integer;capacity integer;used integer;queued integer=0;day1 integer=0;day2 integer=0;enrollment_id uuid;
begin
 select * into a from customer_accounts where business_id=p_business_id and user_id=p_user_id and payment_status='active' for update;
 if not found then raise exception 'customer_base_access_denied';end if;
 select * into s from review_request_settings where business_id=p_business_id for update;
 if found and s.status='paused' then raise exception 'customer_base_paused';end if;
 if s.business_id is null then
  insert into review_request_settings(business_id,status,activated_at) values(p_business_id,'active',now()) returning * into s;
 else
  update review_request_settings set status='active',activated_at=coalesce(activated_at,now()),updated_at=now()
   where business_id=p_business_id returning * into s;
 end if;
 start_day=(s.activated_at at time zone 'America/Sao_Paulo')::date;
 while extract(isodow from start_day)>5 loop start_day=start_day+1;end loop;
 day=greatest(start_day,(now() at time zone 'America/Sao_Paulo')::date);
 while extract(isodow from day)>5 loop day=day+1;end loop;
 select count(*)::integer into day_index from generate_series(start_day::timestamp,day::timestamp,interval '1 day') d where extract(isodow from d)<6;
 select count(*)::integer into used from review_request_enrollments where business_id=p_business_id and activation_date=day;
 for c in select cc.id from customer_contacts cc join customer_imports i on i.id=cc.import_id and i.business_id=cc.business_id and i.status='confirmed'
  where cc.business_id=p_business_id and cc.status='eligible' and cc.opt_out_at is null
   and not exists(select 1 from review_request_enrollments e where e.contact_id=cc.id)
  order by cc.last_purchase_at desc nulls last,cc.created_at,cc.id limit 10000 for update of cc
 loop
  capacity=case when day_index=1 then s.day1_limit when day_index=2 then s.day2_limit else s.steady_limit end;
  while used>=capacity loop
   day=day+1;while extract(isodow from day)>5 loop day=day+1;end loop;day_index=day_index+1;
   capacity=case when day_index=2 then s.day2_limit else s.steady_limit end;
   select count(*)::integer into used from review_request_enrollments where business_id=p_business_id and activation_date=day;
  end loop;
  insert into review_request_enrollments(business_id,contact_id,status,activation_date,next_run_at)
   values(p_business_id,c.id,'queued',day,(day+time '09:00') at time zone 'America/Sao_Paulo') returning id into enrollment_id;
  insert into review_request_events(business_id,enrollment_id,contact_id,channel,event_type,provider,metadata)
   values(p_business_id,enrollment_id,c.id,'system','queued','meulocal',jsonb_build_object('actorUserId',p_user_id,'audienceConfirmed',true,'activationDate',day));
  update customer_contacts set status='queued',updated_at=now() where id=c.id and business_id=p_business_id;
  queued=queued+1;used=used+1;
  if day_index=1 then day1=day1+1;elsif day_index=2 then day2=day2+1;end if;
  first_day=coalesce(first_day,day);last_day=day;
 end loop;
 if queued=0 then
  select min(activation_date),max(activation_date) into first_day,last_day from review_request_enrollments where business_id=p_business_id;
  if first_day is null then raise exception 'customer_base_no_eligible_contacts';end if;
 end if;
 return jsonb_build_object('ok',true,'alreadyActive',queued=0,'queued',queued,'day1',day1,'day2',day2,
  'steadyLimit',s.steady_limit,'weekdaysOnly',true,'maxAttempts',s.max_attempts,'reminders',s.reminder_day_offsets,
  'firstActivationDate',first_day,'lastActivationDate',last_day);
end $$;
revoke all on function public.activate_customer_base(uuid,uuid) from public,anon,authenticated;
grant execute on function public.activate_customer_base(uuid,uuid) to service_role;
