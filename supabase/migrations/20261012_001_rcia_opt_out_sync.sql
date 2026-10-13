-- Preparation only. Do not apply to a remote database without a separate release gate.
create table public.meulocal_opt_out_sync (
  location_id text not null,
  contact_id text not null,
  lead_id uuid not null references public.leads(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','in_progress','blocked','failed','uncertain','synchronized')),
  attempt_id uuid,
  confirmed jsonb not null default '[]'::jsonb check (jsonb_typeof(confirmed) = 'array'),
  evidence_ref text,
  error_code text,
  updated_at timestamptz not null default now(),
  primary key (location_id,contact_id),
  check (location_id = 'uNh3KsM7WFuLeTN8Q583')
);
alter table public.meulocal_opt_out_sync enable row level security;
revoke all on public.meulocal_opt_out_sync from public,anon,authenticated,service_role;
-- Mutations go through the two service-only RPCs; ordinary tenants have no policy.

create function public.claim_meulocal_opt_out_sync(p_location_id text,p_contact_id text,p_lead_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog,public as $$
declare r public.meulocal_opt_out_sync; acquired boolean; next_attempt uuid;
begin
  -- Lock the lead to bind the immutable local refusal and mapping to this claim.
  perform 1 from public.leads where id=p_lead_id and ghl_location_id=p_location_id
    and ghl_contact_id=p_contact_id and opt_out_at is not null for update;
  if not found or p_location_id <> 'uNh3KsM7WFuLeTN8Q583' then raise exception 'opt_out_scope_unverified'; end if;
  insert into public.meulocal_opt_out_sync(location_id,contact_id,lead_id)
    values(p_location_id,p_contact_id,p_lead_id) on conflict do nothing;
  select * into strict r from public.meulocal_opt_out_sync
    where location_id=p_location_id and contact_id=p_contact_id for update;
  if r.lead_id <> p_lead_id then raise exception 'opt_out_lead_mismatch'; end if;
  acquired := r.status in ('pending','blocked','failed');
  -- No expiring lease: crashes/unknown remote results require reconciliation before replay.
  if acquired then
    next_attempt := gen_random_uuid();
    update public.meulocal_opt_out_sync set status='in_progress',attempt_id=next_attempt,error_code=null,updated_at=now()
      where location_id=p_location_id and contact_id=p_contact_id returning * into r;
  end if;
  insert into public.outreach_events(lead_id,channel,event_type,provider,message_key,metadata)
    values(p_lead_id,'system','unsubscribed','meulocal','rcia_opt_out_sync',
      jsonb_build_object('locationId',p_location_id,'contactId',p_contact_id,'attemptId',r.attempt_id,
        'phase',case when acquired then 'claimed' else 'duplicate' end,'status',r.status));
  return jsonb_build_object('acquired',acquired,'status',r.status,'attemptId',r.attempt_id,'confirmed',r.confirmed);
end $$;

create function public.record_meulocal_opt_out_sync(p_location_id text,p_contact_id text,p_attempt_id uuid,
  p_status text,p_confirmed jsonb,p_evidence_ref text,p_error text)
returns boolean language plpgsql security definer set search_path = pg_catalog,public as $$
declare r public.meulocal_opt_out_sync; entry jsonb;
begin
  select * into strict r from public.meulocal_opt_out_sync
    where location_id=p_location_id and contact_id=p_contact_id for update;
  if r.attempt_id is distinct from p_attempt_id or r.status <> 'in_progress' then raise exception 'sync_claim_lost'; end if;
  if p_status not in ('in_progress','blocked','failed','uncertain','synchronized')
    or jsonb_typeof(p_confirmed) is distinct from 'array' or jsonb_array_length(p_confirmed)>2
    or not (p_confirmed @> r.confirmed) then raise exception 'sync_record_invalid'; end if;
  for entry in select value from jsonb_array_elements(p_confirmed) loop
    if coalesce(entry->>'workflowId','') not in ('bb6f4a2b-46d7-4e23-9c99-176461551583','f4500c60-e33d-41f5-a461-c146662e226e')
      or coalesce(entry->>'eventStartTime','')='' then raise exception 'sync_receipt_invalid'; end if;
  end loop;
  if (select count(distinct value->>'workflowId') from jsonb_array_elements(p_confirmed)) <> jsonb_array_length(p_confirmed)
    then raise exception 'sync_receipt_duplicate'; end if;
  if p_status='synchronized' and coalesce(p_evidence_ref,'')='' then raise exception 'sync_evidence_missing'; end if;
  update public.meulocal_opt_out_sync set status=p_status,confirmed=p_confirmed,evidence_ref=p_evidence_ref,
    error_code=p_error,updated_at=now() where location_id=p_location_id and contact_id=p_contact_id;
  insert into public.outreach_events(lead_id,channel,event_type,provider,message_key,metadata)
    values(r.lead_id,'system',case when p_status in ('failed','uncertain') then 'failed' else 'unsubscribed' end,
      'meulocal','rcia_opt_out_sync',jsonb_build_object('locationId',p_location_id,'contactId',p_contact_id,
        'attemptId',p_attempt_id,'status',p_status,'confirmed',p_confirmed,'evidenceRef',p_evidence_ref,'error',p_error));
  return true;
end $$;
revoke all on function public.claim_meulocal_opt_out_sync(text,text,uuid) from public,anon,authenticated;
revoke all on function public.record_meulocal_opt_out_sync(text,text,uuid,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.claim_meulocal_opt_out_sync(text,text,uuid) to service_role;
grant execute on function public.record_meulocal_opt_out_sync(text,text,uuid,text,jsonb,text,text) to service_role;

-- Suppression cannot be reset by a stale reply, approval or cron update.
create function public.preserve_meulocal_opt_out() returns trigger
language plpgsql set search_path = pg_catalog,public as $$
begin
  if tg_op='UPDATE' and old.opt_out_at is not null then new.opt_out_at:=old.opt_out_at; end if;
  if new.opt_out_at is not null then new.lifecycle_stage:='lost'; new.next_action_at:=null; end if;
  return new;
end $$;
create trigger preserve_meulocal_opt_out before insert or update on public.leads
  for each row execute function public.preserve_meulocal_opt_out();

create function public.prevent_opted_out_acquisition() returns trigger
language plpgsql security definer set search_path = pg_catalog,public as $$
begin
  if new.track='meulocal_acquisition' and new.status in ('active','paused') then
    -- Serialize with local opt-out updates; neither enrollment nor refusal can race this check.
    perform 1 from public.leads where id=new.lead_id for update;
    if exists(select 1 from public.leads where id=new.lead_id and opt_out_at is not null) then
      new.status:='cancelled'; new.next_run_at:=null; new.completed_at:=coalesce(new.completed_at,now());
    end if;
  end if;
  return new;
end $$;
create trigger prevent_opted_out_acquisition before insert or update on public.automation_enrollments
  for each row execute function public.prevent_opted_out_acquisition();
