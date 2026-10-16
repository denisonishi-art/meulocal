-- Acknowledgment follows journal + stop/receipt commit, never a preliminary insert.
create function public.ingest_customer_review_event(p_contact_id uuid,p_row jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp set lock_timeout='3s' as $$
declare c public.customer_contacts;e public.ghl_events;en public.review_request_enrollments;bid uuid;
 event_kind text;channel_kind text;receipt jsonb;was_duplicate boolean;facts jsonb;
begin
 if p_row is null or jsonb_typeof(p_row)<>'object' or nullif(p_row->>'external_event_id','') is null
  or length(p_row->>'external_event_id')>200 or p_row#>>'{payload_meta,eventIdentity}' is distinct from 'provider'
  or p_row#>>'{payload_meta,contentHash}' is null or p_row#>>'{payload_meta,contentHash}' !~ '^[0-9a-f]{64}$'
 then raise exception 'review_event_identity_required';end if;
 select business_id into bid from customer_contacts where id=p_contact_id;
 perform 1 from customer_accounts where business_id=bid for update;
 select * into c from customer_contacts where id=p_contact_id for update;
 if not found or c.ghl_location_id is distinct from p_row->>'ghl_location_id' or c.ghl_contact_id is distinct from p_row->>'contact_id'
  or c.ghl_location_id is null or c.ghl_contact_id is null then raise exception 'review_event_scope_conflict';end if;
 facts=jsonb_build_object('event_type',p_row->>'event_type','ghl_location_id',p_row->>'ghl_location_id','contact_id',p_row->>'contact_id',
  'message_id',p_row->>'message_id','conversation_id',p_row->>'conversation_id','direction',p_row->>'direction','channel',p_row->>'channel',
  'normalized_status',p_row->>'normalized_status','opted_out',coalesce((p_row->>'opted_out')::boolean,false),'contentHash',p_row#>>'{payload_meta,contentHash}');
 insert into ghl_events(external_event_id,event_type,ghl_location_id,contact_id,conversation_id,message_id,direction,channel,normalized_status,opted_out,conversion,payload_meta)
 values(p_row->>'external_event_id',p_row->>'event_type',p_row->>'ghl_location_id',p_row->>'contact_id',p_row->>'conversation_id',p_row->>'message_id',
  p_row->>'direction',p_row->>'channel',p_row->>'normalized_status',coalesce((p_row->>'opted_out')::boolean,false),coalesce((p_row->>'conversion')::boolean,false),p_row->'payload_meta')
 on conflict(external_event_id) do nothing;
 was_duplicate=not found;
 select * into strict e from ghl_events where external_event_id=p_row->>'external_event_id' for update;
 receipt=e.payload_meta->'customerReview';
 if receipt is not null then
  if receipt->'facts' is distinct from facts then raise exception 'review_event_payload_conflict';end if;
  return jsonb_build_object('ok',true,'customerFlow',true,'duplicate',true,'eventId',e.external_event_id);
 end if;
 -- A pre-migration partial journal may be resumed only with the same immutable scope/facts.
 if was_duplicate and (e.ghl_location_id is distinct from c.ghl_location_id or e.contact_id is distinct from c.ghl_contact_id
  or e.message_id is distinct from p_row->>'message_id' or e.direction is distinct from p_row->>'direction'
  or e.channel is distinct from p_row->>'channel' or e.event_type is distinct from p_row->>'event_type'
  or e.normalized_status is distinct from p_row->>'normalized_status' or e.opted_out is distinct from coalesce((p_row->>'opted_out')::boolean,false)
  or (e.payload_meta->>'contentHash' is not null and e.payload_meta->>'contentHash' is distinct from p_row#>>'{payload_meta,contentHash}')
  or (e.payload_meta->>'contentHash' is null and (e.payload_meta->>'preview' is distinct from p_row#>>'{payload_meta,preview}' or length(coalesce(e.payload_meta->>'preview',''))>=500)))
 then raise exception 'review_event_payload_conflict';end if;
 channel_kind=case when p_row->>'channel' ~* 'whatsapp' then 'whatsapp' when p_row->>'channel' ~* 'email' then 'email' else 'system' end;
 event_kind=case when coalesce((p_row->>'opted_out')::boolean,false) then 'opted_out' when p_row->>'direction'='inbound' then 'replied'
  when p_row->>'normalized_status'='delivered' then 'delivered' when p_row->>'normalized_status' in ('failed','undelivered') then 'failed'
  when p_row->>'normalized_status'='sent' then 'sent' else null end;
 if event_kind in ('replied','opted_out') then
  perform stop_review_contact(c.business_id,c.id,event_kind,coalesce(nullif(p_row->>'message_id',''),e.external_event_id),channel_kind);
 elsif event_kind is not null then
  select * into en from review_request_enrollments where contact_id=c.id and business_id=c.business_id for update;
  if en.id is not null and not exists(select 1 from review_request_events where enrollment_id=en.id and provider='highlevel' and event_type=event_kind and external_id=coalesce(nullif(p_row->>'message_id',''),e.external_event_id)) then
   insert into review_request_events(business_id,enrollment_id,contact_id,channel,event_type,provider,external_id,metadata)
    values(c.business_id,en.id,c.id,channel_kind,event_kind,'highlevel',coalesce(nullif(p_row->>'message_id',''),e.external_event_id),jsonb_build_object('source','highlevel_webhook','conversation_id',p_row->>'conversation_id'));
  end if;
 end if;
 update ghl_events set payload_meta=payload_meta||jsonb_build_object('customerReview',jsonb_build_object('state','completed','facts',facts)) where id=e.id;
 return jsonb_build_object('ok',true,'customerFlow',true,'duplicate',was_duplicate,'eventId',e.external_event_id);
end $$;
revoke all on function public.ingest_customer_review_event(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ingest_customer_review_event(uuid,jsonb) to service_role;
