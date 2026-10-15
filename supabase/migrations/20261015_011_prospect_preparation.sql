-- Preparation only. No consent, CRM dispatch, enrollment, invite or payment effect.
create function public.prepare_prospect_diagnostics(p_items jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp set lock_timeout='3s' as $$
declare item jsonb; d public.prospect_diagnostics;b public.businesses;l public.leads;n integer;reused boolean;result jsonb='[]'::jsonb;
begin
 if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'prospect_items_invalid';end if;
 if jsonb_array_length(p_items) not between 1 and 10 then raise exception 'prospect_items_invalid';end if;
 if exists(select 1 from jsonb_array_elements(p_items) x group by x->>'id' having count(*)>1) then raise exception 'prospect_items_invalid';end if;
 -- Lock in a stable order across batches; retries share the same persisted resource.
 for item in select value from jsonb_array_elements(p_items) order by value->>'id' loop
  if jsonb_typeof(item) is distinct from 'object' or coalesce(length(btrim(item->>'id')),0) not between 1 and 300 or
   coalesce(length(btrim(item->>'name')),0) not between 1 and 240 or jsonb_typeof(item->'score') is distinct from 'number' or
   (item->>'score')::numeric not between 0 and 100 or (item->>'score')::numeric<>trunc((item->>'score')::numeric) then raise exception 'prospect_items_invalid';end if;
  perform pg_advisory_xact_lock(hashtextextended('meulocal.prospect:'||(item->>'id'),0));
 end loop;
 for item in select value from jsonb_array_elements(p_items) order by value->>'id' loop
  d=null;b=null;l=null;
  select count(*) into n from prospect_diagnostics where place_id=item->>'id';
  if n>1 then raise exception 'prospect_diagnostic_ambiguous';end if;
  reused=n=1;
  if reused then select * into d from prospect_diagnostics where place_id=item->>'id' for update;
  else
   insert into prospect_diagnostics(place_id,business_name,address,rating,review_count,score,competitor_avg_reviews,review_gap,niche,region,competition_mode,competition_label,search_intent)
   values(item->>'id',item->>'name',nullif(item->>'address',''),(item->>'rating')::numeric,coalesce((item->>'reviews')::integer,0),(item->>'score')::integer,
    round((item->>'competitorAverageReviews')::numeric),case when item->>'competitorAverageReviews' is not null then greatest(0,round((item->>'competitorAverageReviews')::numeric-coalesce((item->>'reviews')::integer,0))) end,
    nullif(item->>'niche',''),nullif(item->>'region',''),coalesce(item->>'competitionMode','city_region'),nullif(item->>'competitionLabel',''),nullif(item->>'searchIntent','')) returning * into d;
  end if;
  insert into businesses(google_place_id,name,address,phone,website,google_rating,google_review_count,source,status)
   values(d.place_id,d.business_name,d.address,nullif(item->>'phone',''),nullif(item->>'website',''),d.rating,d.review_count,'outbound','diagnosed') on conflict(google_place_id) do nothing;
  select * into b from businesses where google_place_id=d.place_id for update;
  select count(*) into n from leads where prospect_diagnostic_id=d.id;
  if n>1 then raise exception 'prospect_lead_ambiguous';end if;
  if n=1 then
   select * into l from leads where prospect_diagnostic_id=d.id for update;
   if l.business_id<>b.id then raise exception 'prospect_lead_scope_conflict';end if;
  else
   select count(*) into n from leads where business_id=b.id;
   if n>1 then raise exception 'prospect_lead_ambiguous';end if;
   if n=1 then
    select * into l from leads where business_id=b.id for update;
    if l.prospect_diagnostic_id is not null then raise exception 'prospect_lead_scope_conflict';end if;
    update leads set prospect_diagnostic_id=d.id where id=l.id returning * into l;
   else
    insert into leads(business_id,name,whatsapp,origin,prospect_diagnostic_id)
     values(b.id,d.business_name,nullif(item->>'phone',''),'outbound',d.id) returning * into l;
   end if;
  end if;
  result=result||jsonb_build_array(to_jsonb(d)||jsonb_build_object('business_id',b.id,'lead_id',l.id,'reused',reused));
 end loop;
 return jsonb_build_object('diagnostics',result);
end $$;
revoke all on function public.prepare_prospect_diagnostics(jsonb) from public,anon,authenticated;
grant execute on function public.prepare_prospect_diagnostics(jsonb) to service_role;
