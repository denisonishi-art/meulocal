-- Additive internal gate. Preview only until schema/roles are attested; no remote apply.
alter table public.ghl_events add column if not exists local_processed_at timestamptz;

create function public.apply_meulocal_inbound_event(p_event jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare
 loc text:=p_event->>'ghl_location_id'; cid text:=p_event->>'contact_id';
 eid text:=p_event->>'external_event_id'; legacy text:=p_event->>'legacy_event_id';
 decision text:=p_event->>'classification'; kind text:=p_event->>'kind';
 ch text:=p_event->>'channel'; source text:=p_event->'payload_meta'->>'source';
 e public.ghl_events; l public.leads; c public.customer_contacts; b public.businesses;
 review public.review_request_enrollments; event_kind text; message_key text;
 reply_at timestamptz:=coalesce((p_event->>'occurred_at')::timestamptz,now());
 customer_flow boolean:=false; acquisition_flow boolean:=false; duplicate boolean:=false;
 email text:=nullif(p_event->'contact'->>'email','');
begin
 if loc is null or cid is null or loc !~ '^[a-zA-Z0-9_-]{1,128}$' or cid !~ '^[a-zA-Z0-9_-]{1,128}$'
  or eid is null or eid !~ '^meulocal-inbound:[a-f0-9]{64}$' or legacy is null or length(legacy)>128
  or decision is null or decision not in ('explicit_refusal','common_reply','inconclusive')
  or kind is null or kind not in ('reply','sent','delivered','failed','observation')
  or ch is null or ch not in ('email','whatsapp','system')
  or source is null or source not in ('highlevel_webhook','highlevel_poll','highlevel_reconciliation')
  or (decision='explicit_refusal' and (p_event->>'direction' is distinct from 'inbound' or kind<>'reply'))
  then raise exception 'inbound_event_invalid'; end if;
 -- Serializes all new ingestion paths for this scope; provider IDs are never global authority.
 perform pg_advisory_xact_lock(hashtextextended('meulocal-inbound:'||loc||':'||cid,0));
 if (select count(*) from leads where ghl_location_id=loc and ghl_contact_id=cid)>1
  or (select count(*) from customer_contacts where ghl_location_id=loc and ghl_contact_id=cid)>1
  then raise exception 'inbound_mapping_ambiguous'; end if;
 select * into l from leads where ghl_location_id=loc and ghl_contact_id=cid for update;
 select * into c from customer_contacts where ghl_location_id=loc and ghl_contact_id=cid for update;
 acquisition_flow:=l.id is not null; customer_flow:=c.id is not null;
 select * into e from ghl_events where ghl_location_id=loc and contact_id=cid and
  (external_event_id=eid or ((external_event_id=legacy or (message_id=p_event->>'message_id' and message_id is not null)) and
   coalesce(payload_meta->>'local_kind',case when direction='inbound' or opted_out then 'reply'
    when normalized_status in ('sent','delivered') then normalized_status
    when normalized_status in ('failed','undelivered') then 'failed' else 'observation' end)=kind))
  order by (external_event_id=eid) desc,local_processed_at desc nulls last,created_at asc limit 1 for update;
 if e.payload_meta ? 'classification' then
  if e.payload_meta->>'classification' is distinct from decision
   or e.payload_meta->>'fingerprint' is distinct from p_event->'payload_meta'->>'fingerprint'
   then raise exception 'inbound_event_conflict'; end if;
 end if;
 if e.local_processed_at is not null
  and (l.id is null or e.payload_meta->>'local_lead_id'=l.id::text)
  and (c.id is null or e.payload_meta->>'local_customer_id'=c.id::text) then
  return jsonb_build_object('duplicate',true,'acquisitionFlow',acquisition_flow,'customerFlow',customer_flow,'state',decision,'pending',false);
 end if;
 if e.id is null then
  insert into ghl_events(external_event_id,event_type,ghl_location_id,contact_id,conversation_id,message_id,direction,
   channel,normalized_status,opted_out,payload_meta)
   values(eid,p_event->>'event_type',loc,cid,p_event->>'conversation_id',p_event->>'message_id',p_event->>'direction',
    ch,p_event->>'normalized_status',decision='explicit_refusal',p_event->'payload_meta') returning * into e;
 end if;
 -- Preserve activation-safe local registration, without creating provider contacts.
 -- Unknown locations may be observed but cannot provision a local business from arbitrary data.
 if l.id is null and c.id is null and email is not null and
  exists(select 1 from ghl_locations where ghl_location_id=loc and lifecycle_status='active') then
  if (select count(*) from businesses where ghl_location_id=loc and ghl_contact_id=cid)>1
   then raise exception 'inbound_mapping_ambiguous'; end if;
  select * into b from businesses where ghl_location_id=loc and ghl_contact_id=cid for update;
  if b.id is null then
   insert into businesses(name,source,status,ghl_location_id,ghl_contact_id)
    values(coalesce(nullif(p_event->'contact'->>'name',''),email),'outbound','contacted',loc,cid) returning * into b;
  end if;
  select * into l from leads where business_id=b.id and lower(leads.email)=lower(email) for update;
  if l.id is null then
   insert into leads(business_id,name,email,origin,lifecycle_stage,ghl_location_id,ghl_contact_id)
    values(b.id,coalesce(nullif(p_event->'contact'->>'name',''),email),email,'ghl','conversation',loc,cid) returning * into l;
  elsif (l.ghl_location_id is not null and l.ghl_location_id<>loc) or (l.ghl_contact_id is not null and l.ghl_contact_id<>cid) then
   raise exception 'inbound_mapping_unverified';
  else update leads set ghl_location_id=loc,ghl_contact_id=cid where id=l.id returning * into l;
  end if;
  acquisition_flow:=true;
 end if;
 if reply_at>now()+interval '5 minutes' then raise exception 'inbound_time_unverified'; end if;
 -- Never authorize an event to update a business mapped to a different location.
 if exists(select 1 from businesses where id in (l.business_id,c.business_id) and ghl_location_id is not null and ghl_location_id<>loc)
  then raise exception 'inbound_business_scope_unverified'; end if;
 if c.id is not null and e.payload_meta->>'local_customer_id' is distinct from c.id::text then
  select * into review from review_request_enrollments where contact_id=c.id and business_id=c.business_id for update;
  if kind='reply' then
   if decision='explicit_refusal' then
    update customer_contacts set opt_out_at=coalesce(opt_out_at,now()),status='opted_out',updated_at=now() where id=c.id;
    update review_request_enrollments set status='opted_out',next_run_at=null,completed_at=coalesce(completed_at,now()),updated_at=now() where contact_id=c.id and business_id=c.business_id;
   elsif c.opt_out_at is null and c.status<>'opted_out' then
    if decision='common_reply' then
     update customer_contacts set status='completed',updated_at=now() where id=c.id;
     update review_request_enrollments set status='completed',next_run_at=null,completed_at=coalesce(completed_at,now()),updated_at=now()
      where contact_id=c.id and business_id=c.business_id and status in ('queued','active','paused');
    else
     update review_request_enrollments set status='paused',next_run_at=null,updated_at=now()
      where contact_id=c.id and business_id=c.business_id and status in ('queued','active','paused');
    end if;
   end if;
  end if;
  if review.id is not null and kind<>'observation' and (kind='reply' or exists(
   select 1 from review_request_events where contact_id=c.id and provider='highlevel' and event_type='sent'
    and external_id=legacy)) then
   event_kind:=case when kind='reply' and decision='explicit_refusal' then 'opted_out' when kind='reply' then 'replied' else kind end;
   if not exists(select 1 from review_request_events where contact_id=c.id and provider='highlevel' and external_id=legacy and event_type=event_kind) then
    insert into review_request_events(business_id,enrollment_id,contact_id,channel,event_type,provider,external_id,metadata)
     values(c.business_id,review.id,c.id,ch,event_kind,'highlevel',legacy,p_event->'payload_meta'||jsonb_build_object('eventRef',e.external_event_id));
   end if;
  end if;
 end if;
 -- No early return from reviews: commercial effects use their own scoped lead.
 if l.id is not null and e.payload_meta->>'local_lead_id' is distinct from l.id::text then
  if kind='reply' then
   update leads set opt_out_at=case when decision='explicit_refusal' then coalesce(opt_out_at,now()) else opt_out_at end,
    lifecycle_stage=case when opt_out_at is not null or decision='explicit_refusal' then 'lost'
     when lifecycle_stage in ('lost','customer') then lifecycle_stage when decision='common_reply' then 'conversation' else lifecycle_stage end,
    last_reply_at=greatest(last_reply_at,reply_at),next_action_at=null,updated_at=now()
    where id=l.id and ghl_location_id=loc and ghl_contact_id=cid returning * into l;
   update automation_enrollments set status=case when l.opt_out_at is not null then 'cancelled' when decision='inconclusive' then 'paused' else 'completed' end,
    next_run_at=null,completed_at=case when decision='inconclusive' and l.opt_out_at is null then completed_at else coalesce(completed_at,now()) end
    where lead_id=l.id and track='meulocal_acquisition' and
     (status in ('active','paused') or (l.opt_out_at is not null and status='completed'));
   update businesses set status=case when l.opt_out_at is not null then 'lost' when status in ('lost','customer') then status
     when decision='common_reply' then 'engaged' else status end,updated_at=now()
    where id=l.business_id and (ghl_location_id=loc or ghl_location_id is null);
  end if;
  if kind<>'observation' and (kind='reply' or exists(
   select 1 from outreach_events where lead_id=l.id and provider='highlevel' and event_type='sent' and external_id=legacy)) then
   event_kind:=case when kind='reply' and decision='explicit_refusal' then 'unsubscribed' when kind='reply' then 'replied' else kind end;
   select oe.message_key into message_key from outreach_events oe where lead_id=l.id and event_type in ('sent','delivered')
    and (kind='reply' or oe.external_id=legacy) order by created_at desc limit 1;
   if not exists(select 1 from outreach_events where lead_id=l.id and provider='highlevel' and external_id=legacy and event_type=event_kind) then
    insert into outreach_events(lead_id,channel,event_type,provider,external_id,conversation_id,message_key,metadata)
     values(l.id,ch,event_kind,'highlevel',legacy,p_event->>'conversation_id',message_key,p_event->'payload_meta'||jsonb_build_object('eventRef',e.external_event_id));
   end if;
  end if;
 end if;
 update ghl_events set local_processed_at=case when acquisition_flow or customer_flow or kind<>'reply' then now() else null end,
  payload_meta=payload_meta||p_event->'payload_meta'||jsonb_build_object('local_kind',kind,
   'local_lead_id',l.id,'local_customer_id',c.id,
   'local_envelope',p_event-'contact'-'payload_meta')
  where id=e.id;
 return jsonb_build_object('duplicate',duplicate,'acquisitionFlow',acquisition_flow,'customerFlow',customer_flow,'state',decision,'pending',kind='reply' and not acquisition_flow and not customer_flow);
end $$;
revoke all on function public.apply_meulocal_inbound_event(jsonb) from public,anon,authenticated;
grant execute on function public.apply_meulocal_inbound_event(jsonb) to service_role;

-- Replay durable normalized evidence when a commercial mapping appears after ingress.
-- No message body is retained. Only service_role can produce/replay these internal DTOs.
create function public.replay_meulocal_inbound_events(p_location_id text,p_contact_id text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare e public.ghl_events; l public.leads; r jsonb; states jsonb:='[]'; n int:=0;
begin
 if p_location_id is null or p_contact_id is null or p_location_id !~ '^[a-zA-Z0-9_-]{1,128}$'
  or p_contact_id !~ '^[a-zA-Z0-9_-]{1,128}$' then raise exception 'inbound_scope_unverified'; end if;
 perform pg_advisory_xact_lock(hashtextextended('meulocal-inbound:'||p_location_id||':'||p_contact_id,0));
 if (select count(*) from leads where ghl_location_id=p_location_id and ghl_contact_id=p_contact_id)<>1 then
  raise exception 'inbound_mapping_unverified'; end if;
 select * into l from leads where ghl_location_id=p_location_id and ghl_contact_id=p_contact_id for update;
 for e in select * from ghl_events where ghl_location_id=p_location_id and contact_id=p_contact_id
  and payload_meta->>'local_kind'='reply' and payload_meta->>'local_lead_id' is distinct from l.id::text
  order by created_at,id limit 101 for update loop
  n:=n+1;
  if n>100 or e.payload_meta->'local_envelope' is null then raise exception 'inbound_replay_incomplete'; end if;
  r:=apply_meulocal_inbound_event(e.payload_meta->'local_envelope'||jsonb_build_object('payload_meta',
   jsonb_build_object('source',e.payload_meta->>'source','classification',e.payload_meta->>'classification','fingerprint',e.payload_meta->>'fingerprint')));
  if r->>'acquisitionFlow'<>'true' then raise exception 'inbound_mapping_unverified'; end if;
  states:=states||jsonb_build_array(r->>'state');
 end loop;
 return jsonb_build_object('states',states);
end $$;
revoke all on function public.replay_meulocal_inbound_events(text,text) from public,anon,authenticated;
grant execute on function public.replay_meulocal_inbound_events(text,text) to service_role;
