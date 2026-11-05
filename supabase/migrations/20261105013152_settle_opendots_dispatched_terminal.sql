-- Recognize a valid terminal receipt with dispatched='0' (suggestion-only, no send) OR
-- dispatched='1' (confirmed send) as a completed handoff. The worker sets dispatched='1'
-- ONLY when dispatch.status='sent' (confirmed), so '1' never marks an uncertain/failed send
-- as completed. All other validations (status, eventId, action, lease, cleanup, opt-out) are
-- preserved verbatim.
create or replace function public.initialize_controlled_inbox(p_location_id text,p_contact_id text,p_conversation_id text,p_anchor text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from ghl_events where ghl_location_id=p_location_id and contact_id=p_contact_id and conversation_id=p_conversation_id and message_id=p_anchor and external_event_id=p_anchor
  and payload_meta#>>'{openDots,status}'='decision_saved' and payload_meta#>>'{openDots,eventId}'=p_anchor and payload_meta#>>'{openDots,dispatched}' in ('0','1')
  and payload_meta#>>'{openDots,action}' in ('answer','follow_up','handoff','stop')) then raise exception 'verified_anchor_required';end if;
 insert into ghl_controlled_inboxes(location_id,contact_id,conversation_id,cursor_message_id)
 values(p_location_id,p_contact_id,p_conversation_id,p_anchor) on conflict(location_id,contact_id) do nothing;
 return found;
end $$;

create or replace function public.prepare_controlled_inbound(p_row jsonb,p_message text,p_occurred_at timestamptz)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.ghl_events; l public.leads; j public.opendots_handoffs; receipt jsonb; stopping boolean; k text;
begin
 if p_row->>'external_event_id' is distinct from p_row->>'message_id' or coalesce(length(p_message),0) not between 1 and 4000 or p_occurred_at is null then raise exception 'invalid_verified_message'; end if;
 -- Reject customer-review scope before any acquisition writes.
 if exists(select 1 from customer_contacts where ghl_location_id=p_row->>'ghl_location_id' and ghl_contact_id=p_row->>'contact_id') then return jsonb_build_object('error','controlled_contact_is_customer'); end if;
 begin
  select * into strict l from leads where ghl_location_id=p_row->>'ghl_location_id' and ghl_contact_id=p_row->>'contact_id' for update;
 exception when no_data_found then return jsonb_build_object('error','controlled_lead_not_linked');
 when too_many_rows then return jsonb_build_object('error','controlled_lead_link_ambiguous');
 end;
 insert into ghl_events(external_event_id,event_type,ghl_location_id,contact_id,conversation_id,message_id,direction,channel,opted_out,conversion,payload_meta)
 values(p_row->>'external_event_id','InboundMessage',p_row->>'ghl_location_id',p_row->>'contact_id',p_row->>'conversation_id',p_row->>'message_id','inbound','WhatsApp',coalesce((p_row->>'opted_out')::boolean,false),false,p_row->'payload_meta') on conflict(external_event_id) do nothing;
 select * into strict e from ghl_events where external_event_id=p_row->>'external_event_id' for update;
 if e.ghl_location_id is distinct from p_row->>'ghl_location_id' or e.contact_id is distinct from p_row->>'contact_id' or e.message_id is distinct from p_row->>'message_id' or e.conversation_id is distinct from p_row->>'conversation_id' then return jsonb_build_object('error','event_scope_conflict'); end if;
 receipt=e.payload_meta->'openDots';
 if not exists(select 1 from opendots_handoffs where event_id=e.external_event_id and state<>'completed') and receipt->>'status'='decision_saved' and receipt->>'eventId'=e.external_event_id and receipt->>'dispatched' in ('0','1') and receipt->>'action' in ('answer','follow_up','handoff','stop') then return jsonb_build_object('state','completed','receipt',receipt); end if;
 if e.payload_meta#>>'{controlledInbound,terminal}'='opt_out' then return jsonb_build_object('state','completed','receipt',receipt); end if;
 select * into j from opendots_handoffs where event_id=e.external_event_id;
 if found then
  if j.payload->>'message' is distinct from p_message or (j.payload->>'occurredAt')::timestamptz is distinct from p_occurred_at then return jsonb_build_object('error','event_payload_conflict'); end if;
  return jsonb_build_object('state',j.state,'receipt',j.receipt);
 end if;
 stopping=coalesce((p_row->>'opted_out')::boolean,false) or l.opt_out_at is not null;
 select message_key into k from outreach_events where lead_id=l.id and event_type in ('sent','delivered') order by created_at desc limit 1;
 -- Adoption of legacy failed events does not duplicate already-written reply records.
 if not exists(select 1 from outreach_events where lead_id=l.id and provider='highlevel' and external_id=e.message_id and event_type in ('replied','unsubscribed')) then
  insert into outreach_events(lead_id,channel,event_type,provider,external_id,conversation_id,message_key,metadata)
  values(l.id,'whatsapp',case when stopping then 'unsubscribed' else 'replied' end,'highlevel',e.message_id,e.conversation_id,k,jsonb_build_object('source','controlled_inbound','preview',left(p_message,500)));
 end if;
 update leads set lifecycle_stage=case when stopping then 'lost' else 'conversation' end,
  opt_out_at=case when stopping then coalesce(opt_out_at,p_occurred_at) else opt_out_at end,
  last_reply_at=case when stopping then last_reply_at else greatest(last_reply_at,p_occurred_at) end,next_action_at=null,updated_at=now() where id=l.id;
 update automation_enrollments set status=case when stopping then 'cancelled' else 'completed' end,next_run_at=null,completed_at=now() where lead_id=l.id and track='meulocal_acquisition' and status='active';
 update businesses set status=case when stopping then 'lost' else 'engaged' end,updated_at=now() where id=l.business_id;
 if not found then raise exception 'linked_business_missing'; end if;
 if stopping then
  receipt=jsonb_build_object('status','skipped_opt_out','eventId',e.external_event_id,'dispatched',0);
  update ghl_events set payload_meta=payload_meta||jsonb_build_object('controlledInbound',jsonb_build_object('state','completed','terminal','opt_out'),'openDots',receipt) where id=e.id;
  return jsonb_build_object('state','completed','receipt',receipt);
 end if;
 insert into opendots_handoffs(event_id,kind,business_id,payload)
 values(e.external_event_id,'meulocal.acquisition.inbound',l.business_id,jsonb_build_object('version',1,'kind','meulocal.acquisition.inbound','eventId',e.external_event_id,'leadId',l.id,'businessId',l.business_id,'contactId',e.contact_id,'locationId',e.ghl_location_id,'conversationId',e.conversation_id,'messageId',e.message_id,'message',p_message,'channel','WhatsApp','occurredAt',p_occurred_at,'permissions',jsonb_build_object('initialSend',false,'autoReply',false,'crmWrite',false)));
 update ghl_events set payload_meta=payload_meta||jsonb_build_object('controlledInbound',jsonb_build_object('state','pending')) where id=e.id;
 return jsonb_build_object('state','pending');
end $$;

create or replace function public.settle_opendots_handoff(p_event_id text,p_lease uuid,p_receipt jsonb,p_cleanup_done boolean default false) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare saved boolean; j public.opendots_handoffs;
begin
 select * into j from opendots_handoffs where event_id=p_event_id and state='processing' and lease_token=p_lease for update;
 if not found then return false; end if;
 saved=coalesce(p_receipt->>'status'='decision_saved' and p_receipt->>'eventId'=p_event_id and p_receipt->>'dispatched' in ('0','1') and p_receipt->>'action' in ('answer','follow_up','handoff','stop'),false);
 update opendots_handoffs set state=case when saved and (p_cleanup_done or j.kind='meulocal.customer.lifecycle') then 'completed' else 'pending' end,cleanup_done=p_cleanup_done or j.kind='meulocal.customer.lifecycle',receipt=p_receipt,lease_token=null,available_at=now()+interval '1 minute',updated_at=now() where event_id=p_event_id;
 if j.kind='meulocal.acquisition.inbound' then
  update ghl_events set payload_meta=payload_meta||jsonb_build_object('openDots',p_receipt,'controlledInbound',jsonb_build_object('state',case when saved and p_cleanup_done then 'completed' else 'pending' end)) where external_event_id=p_event_id;
  if not found then raise exception 'event_receipt_missing'; end if;
 end if;
 return true;
end $$;
