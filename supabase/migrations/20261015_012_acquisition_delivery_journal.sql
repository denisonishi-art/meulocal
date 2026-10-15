-- Reuse the existing outreach journal. No provider operation is executed in SQL.
alter table public.outreach_events
 add column dispatch_state text check(dispatch_state in ('reserved','dispatching','sent','ambiguous','cancelled')),
 add column dispatch_kind text check(dispatch_kind in ('initial','cadence','manual')),
 add column dispatch_step integer,
 add column dispatch_payload jsonb,
 add column dispatch_hash text,
 add column dispatch_lease uuid,
 add column dispatch_until timestamptz,
 add column dispatch_available_at timestamptz,
 add column dispatch_at timestamptz,
 add column dispatch_error text;
create unique index outreach_guarded_intent on public.outreach_events(lead_id,message_key) where dispatch_state is not null;
create unique index outreach_guarded_receipt on public.outreach_events(provider,external_id) where dispatch_state='sent' and external_id is not null;
create index outreach_guarded_pending on public.outreach_events(dispatch_available_at) where dispatch_state in ('reserved','dispatching','ambiguous');

create function public.acquisition_delivery_eligible(p_lead_id uuid,p_kind text,p_channel text,p_payload jsonb)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from leads l join businesses b on b.id=l.business_id join prospect_diagnostics d on d.id=l.prospect_diagnostic_id
  where l.id=p_lead_id and l.business_id::text=p_payload->>'businessId' and l.prospect_diagnostic_id::text=p_payload->>'diagnosticId' and l.opt_out_at is null and l.lifecycle_stage not in ('customer','lost')
   and d.status not in ('converted','closed') and d.converted_at is null and b.status not in ('customer','lost')
   and not exists(select 1 from customer_accounts a where a.business_id=l.business_id and a.payment_status='active')
   and l.ghl_contact_id=p_payload->>'contactId' and l.ghl_location_id=p_payload->>'locationId'
   and exists(select 1 from ghl_locations gl where gl.ghl_location_id=l.ghl_location_id and gl.is_internal and gl.lifecycle_status='active')
   and (select count(*) from leads owned where owned.ghl_location_id=l.ghl_location_id and owned.ghl_contact_id=l.ghl_contact_id)=1
   and case p_channel when 'email' then l.consent_email and nullif(btrim(l.email),'') is not null and lower(btrim(l.email))=p_payload->>'recipient'
    when 'whatsapp' then l.consent_whatsapp and nullif(regexp_replace(l.whatsapp,'\D','','g'),'') is not null and regexp_replace(l.whatsapp,'\D','','g')=p_payload->>'recipient' else false end
   and (p_kind='manual' or (l.last_reply_at is null and l.lifecycle_stage not in ('conversation','customer','lost')))
   and not exists(select 1 from outreach_events stop where stop.lead_id=l.id and (stop.event_type='unsubscribed' or (p_kind<>'manual' and stop.event_type='replied')))
   and not exists(select 1 from ghl_events stop where stop.ghl_location_id=l.ghl_location_id and stop.contact_id=l.ghl_contact_id and (stop.opted_out or (p_kind<>'manual' and lower(stop.direction)='inbound')))
 );
$$;

create function public.reserve_acquisition_delivery(p_lead_id uuid,p_kind text,p_step integer,p_request_id uuid,p_channel text,p_message text,p_subject text,p_at timestamptz default now())
returns jsonb language plpgsql security definer set search_path=public,pg_temp set lock_timeout='3s' as $$
declare l public.leads;j public.outreach_events;e public.automation_enrollments;k text;payload jsonb;h text;
begin
 if p_at is null or p_kind is null or p_kind not in ('initial','cadence','manual') or p_channel is null or p_channel not in ('email','whatsapp') or coalesce(length(p_message),0) not between 1 and 4000 or coalesce(length(p_subject),0)>250 then raise exception 'acquisition_intent_invalid';end if;
 if (p_kind='initial' and p_step is distinct from 1) or (p_kind='cadence' and (p_step is null or p_step not in (2,3))) or (p_kind='manual' and (p_request_id is null or p_step is not null)) then raise exception 'acquisition_intent_invalid';end if;
 select * into l from leads where id=p_lead_id for update;
 if not found or nullif(l.ghl_contact_id,'') is null or nullif(l.ghl_location_id,'') is null then return null;end if;
 perform pg_advisory_xact_lock(hashtextextended('meulocal.acquisition:'||l.ghl_location_id||':'||l.ghl_contact_id,0));
 payload=jsonb_build_object('leadId',l.id,'businessId',l.business_id,'diagnosticId',l.prospect_diagnostic_id,'contactId',l.ghl_contact_id,'locationId',l.ghl_location_id,'channel',p_channel,'recipient',case when p_channel='email' then lower(btrim(l.email)) else regexp_replace(l.whatsapp,'\D','','g') end,'message',p_message,'subject',p_subject);
 h=encode(sha256(convert_to(payload::text,'UTF8')),'hex');
 k='acquisition:v1:'||case p_kind when 'initial' then 'initial' when 'cadence' then 'step:'||p_step else 'manual:'||p_request_id end;
 select * into j from outreach_events where lead_id=l.id and message_key=k and dispatch_state is not null for update;
 if found then
  if j.dispatch_hash<>h then raise exception 'acquisition_intent_conflict';end if;
  if j.dispatch_state='sent' then return jsonb_build_object('state','sent','id',j.id,'messageId',j.external_id,'conversationId',j.conversation_id,'replayed',true);end if;
  if j.dispatch_state='dispatching' and j.dispatch_until<=p_at then update outreach_events set dispatch_state='ambiguous',dispatch_error='dispatch_lease_expired' where id=j.id returning * into j;end if;
  if j.dispatch_state in ('ambiguous','cancelled') then return jsonb_build_object('state',j.dispatch_state,'id',j.id);end if;
  if j.dispatch_until>p_at or j.dispatch_available_at>p_at then return null;end if;
 end if;
 if exists(select 1 from outreach_events other where other.id is distinct from j.id and other.dispatch_state in ('reserved','dispatching','ambiguous') and other.dispatch_payload->>'contactId'=l.ghl_contact_id and other.dispatch_payload->>'locationId'=l.ghl_location_id) then return jsonb_build_object('state','blocked','reason','prior_attempt_unresolved');end if;
 if not acquisition_delivery_eligible(l.id,p_kind,p_channel,payload) then return null;end if;
 if p_kind<>'manual' and ((p_at at time zone 'America/Sao_Paulo')::time<time '09:00' or extract(isodow from p_at at time zone 'America/Sao_Paulo')>5) then return null;end if;
 if p_kind='initial' then
  if exists(select 1 from outreach_events old where old.lead_id=l.id and old.dispatch_state is null and old.message_key in ('diagnostic_initial','opendots_initial_v1')) or exists(select 1 from automation_enrollments en where en.lead_id=l.id and en.track='meulocal_acquisition') then return jsonb_build_object('state','blocked','reason','legacy_attempt_reconciliation');end if;
 elsif p_kind='cadence' then
  select * into e from automation_enrollments where lead_id=l.id and track='meulocal_acquisition' for update;
  if not found or e.status<>'active' or e.step<>p_step-1 or e.next_run_at is null or e.next_run_at>p_at or not exists(select 1 from outreach_events prior where prior.lead_id=l.id and prior.dispatch_kind='initial' and prior.dispatch_state='sent') then return null;end if;
 end if;
 if j.id is null then
  insert into outreach_events(lead_id,channel,event_type,provider,message_key,dispatch_kind,dispatch_step,dispatch_payload,dispatch_hash,dispatch_state,dispatch_available_at)
   values(l.id,p_channel,'queued','highlevel',k,p_kind,p_step,payload,h,'reserved',p_at) returning * into j;
 end if;
 update outreach_events set dispatch_lease=gen_random_uuid(),dispatch_until=p_at+interval '2 minutes',dispatch_error=null where id=j.id returning * into j;
 return jsonb_build_object('state','reserved','id',j.id,'lease',j.dispatch_lease,'payload',j.dispatch_payload);
end $$;

create function public.begin_acquisition_delivery(p_event_id uuid,p_lease uuid,p_at timestamptz default now())
returns jsonb language plpgsql security definer set search_path=public,pg_temp set lock_timeout='3s' as $$
declare j public.outreach_events;l public.leads;
begin
 select * into j from outreach_events where id=p_event_id;
 if not found or p_lease is null or p_at is null then return null;end if;
 select * into l from leads where id=j.lead_id for update;
 select * into j from outreach_events where id=p_event_id for update;
 if j.dispatch_state<>'reserved' or j.dispatch_lease is distinct from p_lease or j.dispatch_until<=p_at or j.dispatch_available_at>p_at then return null;end if;
 if not acquisition_delivery_eligible(l.id,j.dispatch_kind,j.channel,j.dispatch_payload) then return null;end if;
 if j.dispatch_kind<>'manual' and ((p_at at time zone 'America/Sao_Paulo')::time<time '09:00' or extract(isodow from p_at at time zone 'America/Sao_Paulo')>5) then return null;end if;
 if j.dispatch_kind='initial' and (exists(select 1 from outreach_events old where old.lead_id=l.id and old.dispatch_state is null and old.message_key in ('diagnostic_initial','opendots_initial_v1')) or exists(select 1 from automation_enrollments en where en.lead_id=l.id and en.track='meulocal_acquisition')) then return null;end if;
 if j.dispatch_kind='cadence' and not exists(select 1 from automation_enrollments en where en.lead_id=l.id and en.track='meulocal_acquisition' and en.status='active' and en.step=j.dispatch_step-1 and en.next_run_at<=p_at) then return null;end if;
 if exists(select 1 from outreach_events other where other.id<>j.id and other.dispatch_state in ('dispatching','ambiguous') and other.dispatch_payload->>'contactId'=l.ghl_contact_id and other.dispatch_payload->>'locationId'=l.ghl_location_id) then return null;end if;
 update outreach_events set dispatch_state='dispatching' where id=j.id;
 if j.dispatch_kind='manual' then
  update automation_enrollments set status='paused',next_run_at=null where lead_id=l.id and track='meulocal_acquisition' and status='active';
  update leads set next_action_at=null where id=l.id;
 end if;
 return jsonb_build_object('ok',true,'id',j.id);
end $$;

create function public.settle_acquisition_delivery(p_event_id uuid,p_lease uuid,p_message_id text,p_conversation_id text,p_at timestamptz default now())
returns jsonb language plpgsql security definer set search_path=public,pg_temp set lock_timeout='3s' as $$
declare j public.outreach_events;l public.leads;e public.automation_enrollments;first_at timestamptz;due date;next_at timestamptz;eligible boolean;
begin
 if p_lease is null or p_at is null or coalesce(length(btrim(p_message_id)),0) not between 1 and 300 then raise exception 'acquisition_receipt_invalid';end if;
 select * into j from outreach_events where id=p_event_id;
 if not found then return null;end if;
 select * into l from leads where id=j.lead_id for update;
 select * into j from outreach_events where id=p_event_id for update;
 if j.dispatch_state='sent' then
  if j.external_id<>p_message_id then raise exception 'acquisition_receipt_conflict';end if;
  return jsonb_build_object('ok',true,'replayed',true,'messageId',j.external_id);
 end if;
 if j.dispatch_state not in ('dispatching','ambiguous') or j.dispatch_lease is distinct from p_lease then return null;end if;
 eligible=acquisition_delivery_eligible(l.id,j.dispatch_kind,j.channel,j.dispatch_payload);
 update outreach_events set dispatch_state='sent',event_type='sent',external_id=p_message_id,conversation_id=p_conversation_id,dispatch_at=p_at,dispatch_error=null where id=j.id;
 if eligible then
  if j.dispatch_kind='manual' then
   update leads set lifecycle_stage='conversation',next_action_at=null,updated_at=p_at where id=l.id;
   update automation_enrollments set status='completed',next_run_at=null,completed_at=p_at where lead_id=l.id and track='meulocal_acquisition' and status in ('active','paused');
  else
   if j.dispatch_kind='initial' then first_at=p_at;
   else select dispatch_at into first_at from outreach_events where lead_id=l.id and dispatch_kind='initial' and dispatch_state='sent';end if;
   if j.dispatch_step<3 then
    due=greatest((first_at at time zone 'America/Sao_Paulo')::date+case when j.dispatch_step=1 then 3 else 7 end,(p_at at time zone 'America/Sao_Paulo')::date+1);
    while extract(isodow from due)>5 loop due=due+1;end loop;
    next_at=(due+time '09:00') at time zone 'America/Sao_Paulo';
   end if;
   if j.dispatch_kind='initial' then
    insert into automation_enrollments(lead_id,track,status,step,next_run_at,started_at) values(l.id,'meulocal_acquisition','active',1,next_at,p_at) on conflict(lead_id,track) do nothing returning * into e;
   else
    update automation_enrollments set step=j.dispatch_step,status=case when j.dispatch_step=3 then 'completed' else 'active' end,next_run_at=next_at,completed_at=case when j.dispatch_step=3 then p_at else null end where lead_id=l.id and track='meulocal_acquisition' and status='active' and step=j.dispatch_step-1 returning * into e;
   end if;
   if e.id is not null then
    update leads set lifecycle_stage='mql',next_action_at=next_at,updated_at=p_at where id=l.id;
    update businesses set status='contacted',updated_at=p_at where id=l.business_id;
    update prospect_diagnostics set status='contacted',first_contact_at=coalesce(first_contact_at,p_at),updated_at=p_at where id=l.prospect_diagnostic_id;
   end if;
  end if;
 end if;
 return jsonb_build_object('ok',true,'messageId',p_message_id,'stopped',not eligible);
end $$;

create function public.fail_acquisition_delivery(p_event_id uuid,p_lease uuid,p_error text,p_at timestamptz default now())
returns boolean language plpgsql security definer set search_path=public,pg_temp set lock_timeout='3s' as $$
begin
 if p_lease is null or p_at is null then return false;end if;
 update outreach_events set dispatch_state=case when dispatch_state='reserved' then 'reserved' else 'ambiguous' end,
  event_type=case when dispatch_state='reserved' then 'queued' else 'failed' end,
  dispatch_until=case when dispatch_state='reserved' then p_at else dispatch_until end,dispatch_available_at=p_at+interval '2 minutes',dispatch_error=left(p_error,100)
  where id=p_event_id and dispatch_lease=p_lease and dispatch_state in ('reserved','dispatching','ambiguous');
 return found;
end $$;
revoke all on function public.acquisition_delivery_eligible(uuid,text,text,jsonb),public.reserve_acquisition_delivery(uuid,text,integer,uuid,text,text,text,timestamptz),public.begin_acquisition_delivery(uuid,uuid,timestamptz),public.settle_acquisition_delivery(uuid,uuid,text,text,timestamptz),public.fail_acquisition_delivery(uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.reserve_acquisition_delivery(uuid,text,integer,uuid,text,text,text,timestamptz),public.begin_acquisition_delivery(uuid,uuid,timestamptz),public.settle_acquisition_delivery(uuid,uuid,text,text,timestamptz),public.fail_acquisition_delivery(uuid,uuid,text,timestamptz) to service_role;

create function public.stop_acquisition_delivery(p_event_id uuid,p_lease uuid,p_kind text,p_stop_id text,p_source text,p_occurred_at timestamptz,p_at timestamptz default now())
returns jsonb language plpgsql security definer set search_path=public,pg_temp set lock_timeout='3s' as $$
declare j public.outreach_events;l public.leads;
begin
 if p_lease is null or p_at is null or p_occurred_at is null or p_kind is null or p_kind not in ('replied','opted_out') or p_source is null or p_source not in ('provider_message','provider_dnd') or coalesce(length(p_stop_id),0) not between 1 and 400 then raise exception 'acquisition_stop_invalid';end if;
 select * into j from outreach_events where id=p_event_id;
 if not found then return null;end if;
 select * into l from leads where id=j.lead_id for update;
 select * into j from outreach_events where id=p_event_id for update;
 if j.dispatch_lease is distinct from p_lease or j.dispatch_state not in ('reserved','cancelled') then return null;end if;
 if l.business_id::text is distinct from j.dispatch_payload->>'businessId' or l.prospect_diagnostic_id::text is distinct from j.dispatch_payload->>'diagnosticId' or l.ghl_contact_id is distinct from j.dispatch_payload->>'contactId' or l.ghl_location_id is distinct from j.dispatch_payload->>'locationId' then return null;end if;
 update leads set opt_out_at=case when p_kind='opted_out' then coalesce(opt_out_at,p_occurred_at) else opt_out_at end,
  last_reply_at=case when p_source='provider_message' then greatest(last_reply_at,p_occurred_at) else last_reply_at end,
  lifecycle_stage=case when lifecycle_stage='customer' then lifecycle_stage when opt_out_at is not null or p_kind='opted_out' then 'lost' else 'conversation' end,next_action_at=null,updated_at=p_at where id=l.id;
 update automation_enrollments set status=case when p_kind='opted_out' then 'cancelled' else 'completed' end,next_run_at=null,completed_at=p_at where lead_id=l.id and track='meulocal_acquisition' and status in ('active','paused');
 update businesses set status=case when p_kind='opted_out' then 'lost' else 'engaged' end,updated_at=p_at where id=l.business_id and status<>'customer';
 if not exists(select 1 from outreach_events e where e.lead_id=l.id and e.message_key='acquisition_stop:'||p_stop_id and e.event_type=case when p_kind='opted_out' then 'unsubscribed' else 'replied' end) then
  insert into outreach_events(lead_id,channel,event_type,provider,external_id,message_key,metadata)
   values(l.id,j.channel,case when p_kind='opted_out' then 'unsubscribed' else 'replied' end,'highlevel',case when p_source='provider_message' then p_stop_id end,'acquisition_stop:'||p_stop_id,jsonb_build_object('source',p_source,'occurredAt',p_occurred_at));
 end if;
 update outreach_events set dispatch_state='cancelled',dispatch_error=p_kind where id=j.id;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.stop_acquisition_delivery(uuid,uuid,text,text,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.stop_acquisition_delivery(uuid,uuid,text,text,text,timestamptz,timestamptz) to service_role;
