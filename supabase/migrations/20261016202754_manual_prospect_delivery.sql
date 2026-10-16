do $$begin if (select md5(regexp_replace(prosrc,'\s','','g')) from pg_proc where oid='public.acquisition_delivery_eligible(uuid,text,text,jsonb)'::regprocedure)<>'599f2a169b0b46e97c16ed162e842f09' then raise exception 'manual_baseline_changed';end if;end $$;
-- Explicit per-message operator authorization; never recipient marketing consent.
create table public.manual_prospect_permissions(
 request_id uuid primary key,place_id text not null,name text not null,address text,
 channel text not null check(channel in ('email','whatsapp')),recipient text not null,message text not null,
 lead_id uuid not null references public.leads(id),location_id text not null check(location_id='uNh3KsM7WFuLeTN8Q583'),
 contact_id text,stage text not null check(stage in ('provisioning','ready')),lease uuid not null default gen_random_uuid(),
 created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '30 minutes'
);
alter table public.manual_prospect_permissions enable row level security;
revoke all on public.manual_prospect_permissions from public,anon,authenticated;
grant select,insert,update on public.manual_prospect_permissions to service_role;

create function public.check_manual_prospect_recipient(p_place_id text,p_channel text,p_recipient text)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('allowed',reason is null,'reason',reason) from (select case
 when p_channel not in ('email','whatsapp') then 'Canal inválido.'
 when not exists(select 1 from ghl_locations where ghl_location_id='uNh3KsM7WFuLeTN8Q583' and is_internal and lifecycle_status='active') then 'Unidade HighLevel indisponível.'
 when exists(select 1 from businesses b where b.google_place_id=p_place_id and (b.status in ('customer','lost') or exists(select 1 from customer_accounts a where a.business_id=b.id and a.payment_status='active'))) then 'Confira o relacionamento existente antes de abordar.'
 when exists(select 1 from leads l join businesses b on b.id=l.business_id where (case p_channel when 'email' then lower(btrim(l.email))=p_recipient else regexp_replace(l.whatsapp,'\D','','g')=regexp_replace(p_recipient,'\D','','g') end) and (b.google_place_id is distinct from p_place_id or l.opt_out_at is not null or (l.ghl_location_id is not null and l.ghl_location_id<>'uNh3KsM7WFuLeTN8Q583'))) then 'Destinatário restrito ou vinculado a outra empresa.'
 when exists(select 1 from manual_prospect_permissions a where a.channel=p_channel and a.recipient=p_recipient and a.place_id<>p_place_id) then 'Destinatário vinculado a outra empresa.'
 when (select count(*) from leads l join businesses b on b.id=l.business_id where b.google_place_id=p_place_id)>1 then 'Há vínculos duplicados que exigem revisão.'
 when exists(select 1 from leads l join businesses b on b.id=l.business_id where b.google_place_id=p_place_id and (l.opt_out_at is not null or l.lifecycle_stage in ('customer','lost') or exists(select 1 from outreach_events e where e.lead_id=l.id and (e.event_type='unsubscribed' or e.dispatch_state in ('dispatching','ambiguous'))) or exists(select 1 from ghl_events e where e.ghl_location_id=l.ghl_location_id and e.contact_id=l.ghl_contact_id and e.opted_out))) then 'Há restrição ou tentativa anterior pendente de conferência.'
 when exists(select 1 from manual_prospect_permissions a where a.place_id=p_place_id and a.recipient=p_recipient and a.stage='provisioning') then 'Cadastro anterior pendente de reconciliação no HighLevel.'
 else null end reason) checks;
$$;
revoke all on function public.check_manual_prospect_recipient(text,text,text) from public,anon,authenticated;
grant execute on function public.check_manual_prospect_recipient(text,text,text) to service_role;

create function public.prepare_manual_prospect(p_request_id uuid,p_place_id text,p_name text,p_address text,p_channel text,p_recipient text,p_message text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp set lock_timeout='3s' as $$
declare a public.manual_prospect_permissions;b public.businesses;l public.leads;n integer;loc text='uNh3KsM7WFuLeTN8Q583';
begin
 if p_request_id is null or coalesce(length(p_place_id),0) not between 8 and 180 or coalesce(length(p_name),0) not between 2 and 240 or p_channel not in ('email','whatsapp') or coalesce(length(p_recipient),0) not between 5 and 250 or coalesce(length(p_message),0) not between 50 and 1800 then raise exception 'manual_intent_invalid';end if;
 perform pg_advisory_xact_lock(hashtextextended('manual-recipient:'||lower(p_recipient),0));
 perform pg_advisory_xact_lock(hashtextextended('manual-place:'||p_place_id,0));
 select * into a from manual_prospect_permissions where request_id=p_request_id for update;
 if found then
  if a.place_id<>p_place_id or a.channel<>p_channel or a.recipient<>p_recipient or a.message<>p_message or a.name<>p_name then raise exception 'manual_intent_conflict';end if;
  if a.expires_at<=now() then raise exception 'manual_authorization_expired';end if;
  return jsonb_build_object('state',case when a.stage='ready' then 'ready' else 'reconciliation_required' end,'leadId',a.lead_id,'contactId',a.contact_id);
 end if;
 if exists(select 1 from manual_prospect_permissions where channel=p_channel and recipient=p_recipient and place_id<>p_place_id) then raise exception 'manual_recipient_restricted';end if;
 if not exists(select 1 from ghl_locations where ghl_location_id=loc and is_internal and lifecycle_status='active') then raise exception 'manual_location_unavailable';end if;
 insert into businesses(google_place_id,name,address,source,status) values(p_place_id,p_name,p_address,'manual','new') on conflict(google_place_id) do nothing;
 select * into b from businesses where google_place_id=p_place_id for update;
 if b.status in ('customer','lost') or exists(select 1 from customer_accounts where business_id=b.id and payment_status='active') then raise exception 'manual_existing_relationship';end if;
 if exists(select 1 from leads where (case p_channel when 'email' then lower(btrim(email))=p_recipient else regexp_replace(whatsapp,'\D','','g')=regexp_replace(p_recipient,'\D','','g') end) and (business_id<>b.id or opt_out_at is not null or (ghl_location_id is not null and ghl_location_id<>loc))) then raise exception 'manual_recipient_restricted';end if;
 select count(*) into n from leads where business_id=b.id;
 if n>1 then raise exception 'manual_lead_ambiguous';end if;
 if n=1 then
  select * into l from leads where business_id=b.id for update;
  if l.opt_out_at is not null or l.lifecycle_stage in ('customer','lost') or (l.ghl_location_id is not null and l.ghl_location_id<>loc) or (p_channel='email' and nullif(btrim(l.email),'') is not null and lower(btrim(l.email))<>p_recipient) or (p_channel='whatsapp' and nullif(l.whatsapp,'') is not null and regexp_replace(l.whatsapp,'\D','','g')<>regexp_replace(p_recipient,'\D','','g')) then raise exception 'manual_recipient_restricted';end if;
 else
  insert into leads(business_id,name,origin) values(b.id,p_name,'outbound') returning * into l;
 end if;
 if exists(select 1 from manual_prospect_permissions where lead_id=l.id and channel=p_channel and recipient=p_recipient and message=p_message) then raise exception 'manual_message_already_prepared';end if;
 insert into manual_prospect_permissions(request_id,place_id,name,address,channel,recipient,message,lead_id,location_id,stage)
 values(p_request_id,p_place_id,p_name,p_address,p_channel,p_recipient,p_message,l.id,loc,'provisioning') returning * into a;
 return jsonb_build_object('state','prepare','leadId',l.id,'lease',a.lease,'contactId',l.ghl_contact_id);
end $$;

create function public.bind_manual_prospect(p_request_id uuid,p_lease uuid,p_contact_id text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp set lock_timeout='3s' as $$
declare a public.manual_prospect_permissions;l public.leads;
begin
 select * into a from manual_prospect_permissions where request_id=p_request_id for update;
 if not found or a.lease is distinct from p_lease or a.expires_at<=now() or a.stage<>'provisioning' or coalesce(length(p_contact_id),0) not between 5 and 180 then raise exception 'manual_binding_invalid';end if;
 select * into l from leads where id=a.lead_id for update;
 if l.opt_out_at is not null or (nullif(l.ghl_contact_id,'') is not null and l.ghl_contact_id<>p_contact_id) or exists(select 1 from leads where id<>l.id and ghl_contact_id=p_contact_id and ghl_location_id=a.location_id) then raise exception 'manual_binding_conflict';end if;
 update leads set email=case when a.channel='email' then a.recipient else email end,whatsapp=case when a.channel='whatsapp' then a.recipient else whatsapp end,ghl_contact_id=p_contact_id,ghl_location_id=a.location_id,updated_at=now() where id=l.id;
 update manual_prospect_permissions set contact_id=p_contact_id,stage='ready' where request_id=a.request_id;
 return jsonb_build_object('leadId',l.id,'contactId',p_contact_id);
end $$;
revoke all on function public.prepare_manual_prospect(uuid,text,text,text,text,text,text),public.bind_manual_prospect(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.prepare_manual_prospect(uuid,text,text,text,text,text,text),public.bind_manual_prospect(uuid,uuid,text) to service_role;

create or replace function public.acquisition_delivery_eligible(p_lead_id uuid,p_kind text,p_channel text,p_payload jsonb)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from leads l join businesses b on b.id=l.business_id left join prospect_diagnostics d on d.id=l.prospect_diagnostic_id
  where l.id=p_lead_id and l.business_id::text=p_payload->>'businessId' and (l.prospect_diagnostic_id::text is not distinct from p_payload->>'diagnosticId') and l.opt_out_at is null and l.lifecycle_stage not in ('customer','lost')
   and ((d.status not in ('converted','closed') and d.converted_at is null) or (p_kind='manual' and l.prospect_diagnostic_id is null)) and b.status not in ('customer','lost')
   and not exists(select 1 from customer_accounts a where a.business_id=l.business_id and a.payment_status='active')
   and l.ghl_contact_id=p_payload->>'contactId' and l.ghl_location_id=p_payload->>'locationId'
   and exists(select 1 from ghl_locations gl where gl.ghl_location_id=l.ghl_location_id and gl.is_internal and gl.lifecycle_status='active')
   and (select count(*) from leads owned where owned.ghl_location_id=l.ghl_location_id and owned.ghl_contact_id=l.ghl_contact_id)=1
   and case p_channel when 'email' then (l.consent_email or (p_kind='manual' and exists(select 1 from manual_prospect_permissions a where a.lead_id=l.id and a.stage='ready' and a.location_id=l.ghl_location_id and a.contact_id=l.ghl_contact_id and a.channel=p_channel and a.recipient=case p_channel when 'email' then lower(btrim(l.email)) else l.whatsapp end and a.message=p_payload->>'message' and a.expires_at>now()))) and nullif(btrim(l.email),'') is not null and lower(btrim(l.email))=p_payload->>'recipient'
    when 'whatsapp' then (l.consent_whatsapp or (p_kind='manual' and exists(select 1 from manual_prospect_permissions a where a.lead_id=l.id and a.stage='ready' and a.location_id=l.ghl_location_id and a.contact_id=l.ghl_contact_id and a.channel=p_channel and a.recipient=case p_channel when 'email' then lower(btrim(l.email)) else l.whatsapp end and a.message=p_payload->>'message' and a.expires_at>now()))) and nullif(regexp_replace(l.whatsapp,'\D','','g'),'') is not null and regexp_replace(l.whatsapp,'\D','','g')=p_payload->>'recipient' else false end
   and (p_kind='manual' or (l.last_reply_at is null and l.lifecycle_stage not in ('conversation','customer','lost')))
   and not exists(select 1 from outreach_events stop where stop.lead_id=l.id and (stop.event_type='unsubscribed' or (p_kind<>'manual' and stop.event_type='replied')))
   and not exists(select 1 from ghl_events stop where stop.ghl_location_id=l.ghl_location_id and stop.contact_id=l.ghl_contact_id and (stop.opted_out or (p_kind<>'manual' and lower(stop.direction)='inbound')))
 );
$$;
