-- Existing workflow wakes the inbox; provider history supplies immutable message IDs.
create table public.ghl_controlled_inboxes (
 location_id text not null,
 contact_id text not null,
 conversation_id text not null,
 cursor_message_id text not null,
 lease_token uuid,
 leased_until timestamptz not null default '-infinity',
 last_error text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(location_id,contact_id)
);
alter table public.ghl_controlled_inboxes enable row level security;
revoke all on public.ghl_controlled_inboxes from public,anon,authenticated;
grant select on public.ghl_controlled_inboxes to service_role;

create function public.initialize_controlled_inbox(p_location_id text,p_contact_id text,p_conversation_id text,p_anchor text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from ghl_events where ghl_location_id=p_location_id and contact_id=p_contact_id and conversation_id=p_conversation_id and message_id=p_anchor and external_event_id=p_anchor
  and payload_meta#>>'{openDots,status}'='decision_saved' and payload_meta#>>'{openDots,eventId}'=p_anchor and payload_meta#>>'{openDots,dispatched}'='0'
  and payload_meta#>>'{openDots,action}' in ('answer','follow_up','handoff','stop')) then raise exception 'verified_anchor_required';end if;
 insert into ghl_controlled_inboxes(location_id,contact_id,conversation_id,cursor_message_id)
 values(p_location_id,p_contact_id,p_conversation_id,p_anchor) on conflict(location_id,contact_id) do nothing;
 return found;
end $$;

create function public.claim_controlled_inbox(p_location_id text,p_contact_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.ghl_controlled_inboxes;
begin
 select * into c from ghl_controlled_inboxes where location_id=p_location_id and contact_id=p_contact_id for update;
 if not found then return jsonb_build_object('error','controlled_inbox_not_initialized');end if;
 if c.leased_until>now() then return null;end if;
 update ghl_controlled_inboxes set lease_token=gen_random_uuid(),leased_until=now()+interval '1 minute',last_error=null,updated_at=now()
 where location_id=p_location_id and contact_id=p_contact_id returning * into c;
 return to_jsonb(c);
end $$;

create function public.release_controlled_inbox(p_lease uuid,p_error text default null)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update ghl_controlled_inboxes set lease_token=null,leased_until=now(),last_error=left(p_error,100),updated_at=now() where lease_token=p_lease;
 return found;
end $$;

create function public.ingest_controlled_inbox_batch(p_lease uuid,p_messages jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.ghl_controlled_inboxes; m jsonb; r jsonb; e public.ghl_events; at timestamptz; body text; n integer=0; ignored integer=0;
begin
 select * into c from ghl_controlled_inboxes where lease_token=p_lease and leased_until>now() for update;
 if not found then raise exception 'inbox_lease_expired';end if;
 if jsonb_typeof(p_messages) is distinct from 'array' or jsonb_array_length(p_messages) not between 1 and 250 then raise exception 'invalid_inbox_batch';end if;
 if (select count(distinct value->>'id') from jsonb_array_elements(p_messages))<>jsonb_array_length(p_messages) then raise exception 'duplicate_inbox_message';end if;
 for m in select value from jsonb_array_elements(p_messages) with ordinality as x(value,ord) order by ord loop
  if coalesce(length(m->>'id'),0) not between 1 and 256 or m->>'id'=c.cursor_message_id or m->>'contactId' is distinct from c.contact_id or m->>'conversationId' is distinct from c.conversation_id
   or (m->>'locationId' is not null and m->>'locationId'<>c.location_id) or m->>'dateAdded' is null then raise exception 'inbox_message_scope_conflict';end if;
  at=(m->>'dateAdded')::timestamptz;body=btrim(coalesce(m->>'body',''));
  if m->>'direction'='inbound' and (m->>'messageType'='TYPE_WHATSAPP' or m->>'type'='19') and length(body)>0 then
   if length(body)>4000 then raise exception 'inbox_message_too_long';end if;
   r=prepare_controlled_inbound(jsonb_build_object('external_event_id',m->>'id','message_id',m->>'id','ghl_location_id',c.location_id,'contact_id',c.contact_id,'conversation_id',c.conversation_id,
    'opted_out',lower(body)~'^(sair|stop|cancelar|unsubscribe)$','payload_meta',jsonb_build_object('source','controlled_inbox_history','preview',left(body,500))),body,at);
   if r ? 'error' then raise exception 'controlled_inbox_prepare_failed: %',r->>'error';end if;
   n=n+1;
  else
   insert into ghl_events(external_event_id,message_id,event_type,ghl_location_id,contact_id,conversation_id,direction,channel,payload_meta)
   values(m->>'id',m->>'id','ControlledInboxObserved',c.location_id,c.contact_id,c.conversation_id,m->>'direction',coalesce(m->>'messageType','unknown'),
    jsonb_build_object('source','controlled_inbox_history','controlledInbound',jsonb_build_object('state','ignored','reason','outside_text_inbound_contract'))) on conflict(external_event_id) do nothing;
   select * into strict e from ghl_events where external_event_id=m->>'id';
   if e.message_id is distinct from m->>'id' or e.ghl_location_id is distinct from c.location_id or e.contact_id is distinct from c.contact_id or e.conversation_id is distinct from c.conversation_id then raise exception 'inbox_event_scope_conflict';end if;
   ignored=ignored+1;
  end if;
  c.cursor_message_id=m->>'id';
 end loop;
 update ghl_controlled_inboxes set cursor_message_id=c.cursor_message_id,lease_token=null,leased_until=now(),last_error=null,updated_at=now() where location_id=c.location_id and contact_id=c.contact_id;
 return jsonb_build_object('ingested',n,'ignored',ignored);
end $$;

-- A STOP discovered in this batch must suppress earlier pending commercial work.
-- A saved remote receipt remains available for its existing cleanup-only retry.
create or replace function public.claim_opendots_handoff(p_event_id text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.opendots_handoffs; terminal_receipt jsonb;
begin
 select * into j from opendots_handoffs where event_id=p_event_id for update;
 if not found then return null;end if;
 if j.state='completed' then return jsonb_build_object('state',j.state,'receipt',j.receipt);end if;
 if j.kind='meulocal.acquisition.inbound' and coalesce(j.receipt->>'status','')<>'decision_saved' and exists(
  select 1 from leads where id::text=j.payload->>'leadId' and business_id=j.business_id and ghl_location_id=j.payload->>'locationId' and ghl_contact_id=j.payload->>'contactId' and opt_out_at is not null
 ) then
  terminal_receipt=jsonb_build_object('status','skipped_opt_out','eventId',p_event_id,'dispatched',0);
  update opendots_handoffs set state='completed',lease_token=null,receipt=terminal_receipt,updated_at=now() where event_id=p_event_id;
  update ghl_events set payload_meta=payload_meta||jsonb_build_object('openDots',terminal_receipt,'controlledInbound',jsonb_build_object('state','completed','terminal','opt_out','reason','suppressed_after_opt_out')) where external_event_id=p_event_id;
  return jsonb_build_object('state','completed','receipt',terminal_receipt);
 end if;
 if j.available_at>now() then return null;end if;
 update opendots_handoffs set state='processing',lease_token=gen_random_uuid(),available_at=now()+interval '3 minutes',attempts=attempts+1,updated_at=now() where event_id=p_event_id returning * into j;
 return jsonb_build_object('state',j.state,'lease_token',j.lease_token,'payload',j.payload,'receipt',j.receipt,'cleanup_done',j.cleanup_done);
end $$;

revoke all on function public.initialize_controlled_inbox(text,text,text,text),public.claim_controlled_inbox(text,text),public.release_controlled_inbox(uuid,text),public.ingest_controlled_inbox_batch(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.initialize_controlled_inbox(text,text,text,text),public.claim_controlled_inbox(text,text),public.release_controlled_inbox(uuid,text),public.ingest_controlled_inbox_batch(uuid,jsonb) to service_role;
