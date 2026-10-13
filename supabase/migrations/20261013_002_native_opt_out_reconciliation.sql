-- Additive service-only reconciliation. No dispatcher, callbacks or remote migrations.
alter table public.meulocal_opt_out_sync
 add column if not exists native_plan jsonb,
 add column if not exists native_binding jsonb,
 add column if not exists native_receipt jsonb;

create function public.assert_meulocal_native_binding(p_plan jsonb,p_binding jsonb) returns void
language plpgsql set search_path=pg_catalog,public as $$
declare targets jsonb:='["bb6f4a2b-46d7-4e23-9c99-176461551583","f4500c60-e33d-41f5-a461-c146662e226e"]';
begin
 if jsonb_typeof(p_plan) is distinct from 'object' or jsonb_typeof(p_binding) is distinct from 'object'
  or jsonb_typeof(p_plan->'targetWorkflowIds') is distinct from 'array'
  or jsonb_typeof(p_binding->'targetWorkflowIds') is distinct from 'array' then raise exception 'native_binding_invalid'; end if;
 if jsonb_array_length(p_plan->'targetWorkflowIds')<>2 or jsonb_array_length(p_binding->'targetWorkflowIds')<>2
  or p_plan - array['locationId','contactId','leadId','optOutAt','source','sourceEventRef','eventOrigin','correlationId','attemptId','auditRef','tag','preparedAt','targetWorkflowIds','dispatchAllowed'] <> '{}'::jsonb
  or p_binding - array['locationId','blockingWorkflowId','evidenceRef','published','trigger','tag','targetWorkflowIds','removalScope'] <> '{}'::jsonb
  or not (p_plan->'targetWorkflowIds' @> targets) or not (p_binding->'targetWorkflowIds' @> targets)
  or p_plan->>'tag' is distinct from 'meulocal:opt-out-comercial' or p_binding->>'tag' is distinct from p_plan->>'tag'
  or p_binding->>'locationId' is distinct from p_plan->>'locationId'
  or p_binding->>'trigger' is distinct from 'contact_tag_added' or p_binding->>'removalScope' is distinct from 'specific_workflows'
  or p_binding->'published' is distinct from 'true'::jsonb or p_plan->'dispatchAllowed' is distinct from 'false'::jsonb
  or coalesce(p_binding->>'blockingWorkflowId','') !~ '^[a-zA-Z0-9_-]{1,128}$'
  or targets ? (p_binding->>'blockingWorkflowId')
  or coalesce(p_binding->>'evidenceRef','') !~ '^[a-zA-Z][a-zA-Z0-9_-]*:[a-zA-Z0-9_:./-]{1,240}$'
  then raise exception 'native_binding_invalid'; end if;
end $$;
revoke all on function public.assert_meulocal_native_binding(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.assert_meulocal_native_binding(jsonb,jsonb) to service_role;

create function public.record_meulocal_native_opt_out_intent(p_location_id text,p_contact_id text,p_lead_id uuid,p_attempt_id uuid,p_plan jsonb,p_binding jsonb)
returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare l public.leads; r public.meulocal_opt_out_sync; prepared timestamptz; expected_correlation text;
begin
 select * into l from leads where id=p_lead_id and ghl_location_id=p_location_id and ghl_contact_id=p_contact_id and opt_out_at is not null for update;
 if l.id is null or p_location_id is distinct from 'uNh3KsM7WFuLeTN8Q583' then raise exception 'opt_out_scope_unverified'; end if;
 select * into strict r from meulocal_opt_out_sync where location_id=p_location_id and contact_id=p_contact_id for update;
 if r.lead_id<>p_lead_id or r.attempt_id is distinct from p_attempt_id or r.status<>'in_progress' or r.confirmed<>'[]'::jsonb then raise exception 'native_claim_lost'; end if;
 perform assert_meulocal_native_binding(p_plan,p_binding);
 prepared:=(p_plan->>'preparedAt')::timestamptz;
 expected_correlation:=encode(extensions.digest(replace(json_build_array('meulocal-native-opt-out-v1',p_location_id,p_contact_id,p_lead_id::text,
  to_char(l.opt_out_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text,', ',','),'sha256'),'hex');
 if p_plan->>'locationId' is distinct from p_location_id or p_plan->>'contactId' is distinct from p_contact_id
  or p_plan->>'leadId' is distinct from p_lead_id::text or p_plan->>'attemptId' is distinct from p_attempt_id::text
  or (p_plan->>'optOutAt')::timestamptz is distinct from l.opt_out_at or prepared is null or prepared<l.opt_out_at or prepared>clock_timestamp()
  or p_plan->>'correlationId' is distinct from expected_correlation
  or coalesce(p_plan->>'source','') not in ('ghl_webhook','ghl_poll','opendots','rcia')
  or coalesce(p_plan->>'sourceEventRef','') !~ '^[a-zA-Z][a-zA-Z0-9_-]*:[a-zA-Z0-9_:./-]{1,120}$'
  or p_plan->>'auditRef' is distinct from 'native-optout:v1:'||(p_plan->>'source')||':'||expected_correlation||':'||(p_plan->>'sourceEventRef')
  or length(p_plan::text)>5000 or length(p_binding::text)>5000 then raise exception 'native_intent_invalid'; end if;
 if r.native_plan is not null then
  if r.native_plan<>p_plan or r.native_binding<>p_binding then raise exception 'native_intent_immutable'; end if;
  return true;
 end if;
 update meulocal_opt_out_sync set native_plan=p_plan,native_binding=p_binding where location_id=p_location_id and contact_id=p_contact_id;
 perform record_meulocal_opt_out_sync(p_location_id,p_contact_id,p_attempt_id,'in_progress','[]',p_plan->>'auditRef',null);
 return true;
end $$;
revoke all on function public.record_meulocal_native_opt_out_intent(text,text,uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.record_meulocal_native_opt_out_intent(text,text,uuid,uuid,jsonb,jsonb) to service_role;

create function public.reconcile_meulocal_native_opt_out(p_location_id text,p_contact_id text,p_lead_id uuid,p_attempt_id uuid,p_expected_status text,p_evidence jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare l public.leads; r public.meulocal_opt_out_sync; a jsonb; w jsonb; observed timestamptz; completed timestamptz;
 targets jsonb:='["bb6f4a2b-46d7-4e23-9c99-176461551583","f4500c60-e33d-41f5-a461-c146662e226e"]';
begin
 select * into l from leads where id=p_lead_id and ghl_location_id=p_location_id and ghl_contact_id=p_contact_id and opt_out_at is not null for update;
 if l.id is null or p_location_id is distinct from 'uNh3KsM7WFuLeTN8Q583' then raise exception 'opt_out_scope_unverified'; end if;
 select * into strict r from meulocal_opt_out_sync where location_id=p_location_id and contact_id=p_contact_id for update;
 if r.lead_id<>p_lead_id or r.attempt_id is distinct from p_attempt_id or r.native_plan is null or r.native_binding is null
  or r.confirmed<>'[]'::jsonb then raise exception 'native_attempt_unverified'; end if;
 -- Idempotent receipt lookup, never a new assertion of current remote absence.
 if r.status='synchronized' and r.native_receipt=p_evidence then return jsonb_build_object('recorded',false,'duplicate',true); end if;
 if p_expected_status is null or p_expected_status not in ('uncertain','in_progress') or r.status<>p_expected_status then raise exception 'native_reconciliation_conflict'; end if;
 perform assert_meulocal_native_binding(r.native_plan,r.native_binding);
 if (r.native_plan->>'optOutAt')::timestamptz is distinct from l.opt_out_at
  or r.native_plan->>'locationId' is distinct from p_location_id or r.native_plan->>'contactId' is distinct from p_contact_id
  or r.native_plan->>'leadId' is distinct from p_lead_id::text or r.native_plan->>'attemptId' is distinct from p_attempt_id::text
  then raise exception 'native_intent_invalid'; end if;
 if jsonb_typeof(p_evidence) is distinct from 'object' or length(p_evidence::text)>12000
  or p_evidence - array['source','evidenceRef','correlationMethod','locationId','contactId','blockingWorkflowId','correlationId','attemptId','actions','absence'] <> '{}'::jsonb
  or p_evidence->>'source' is distinct from 'verified_native_adapter' or p_evidence->>'correlationMethod' is distinct from 'verified_execution_link'
  or p_evidence->>'locationId' is distinct from p_location_id or p_evidence->>'contactId' is distinct from p_contact_id
  or p_evidence->>'attemptId' is distinct from p_attempt_id::text
  or p_evidence->>'correlationId' is distinct from r.native_plan->>'correlationId'
  or p_evidence->>'blockingWorkflowId' is distinct from r.native_binding->>'blockingWorkflowId'
  or coalesce(p_evidence->>'evidenceRef','') !~ '^[a-zA-Z][a-zA-Z0-9_-]*:[a-zA-Z0-9_:./-]{1,240}$'
  or jsonb_typeof(p_evidence->'actions') is distinct from 'array'
  or jsonb_typeof(p_evidence->'absence') is distinct from 'object'
  or (p_evidence->'absence') - array['complete','observedAt','workflows'] <> '{}'::jsonb
  or jsonb_typeof(p_evidence->'absence'->'workflows') is distinct from 'array'
  or p_evidence->'absence'->'complete' is distinct from 'true'::jsonb then raise exception 'native_evidence_invalid'; end if;
 if jsonb_array_length(p_evidence->'actions')<>2 or jsonb_array_length(p_evidence->'absence'->'workflows')<>2
  or not ((select jsonb_agg(x->>'workflowId') from jsonb_array_elements(p_evidence->'actions') x) @> targets)
  or not ((select jsonb_agg(x->>'workflowId') from jsonb_array_elements(p_evidence->'absence'->'workflows') x) @> targets)
  or (select count(distinct x->>'executionId') from jsonb_array_elements(p_evidence->'actions') x)<>1
  or (select count(distinct x->>'actionLogId') from jsonb_array_elements(p_evidence->'actions') x)<>2 then raise exception 'native_evidence_invalid'; end if;
 observed:=(p_evidence->'absence'->>'observedAt')::timestamptz;
 if observed is null or observed>clock_timestamp() or observed<clock_timestamp()-interval '60 seconds'
  or observed<(r.native_plan->>'preparedAt')::timestamptz then raise exception 'native_evidence_stale'; end if;
 for a in select value from jsonb_array_elements(p_evidence->'actions') loop
  completed:=(a->>'completedAt')::timestamptz;
  if a->'succeeded' is distinct from 'true'::jsonb or completed is null or completed>observed
   or completed<(r.native_plan->>'preparedAt')::timestamptz
   or coalesce(a->>'executionId','') !~ '^[a-zA-Z0-9_-]{1,128}$' or coalesce(a->>'actionLogId','') !~ '^[a-zA-Z0-9_-]{1,128}$'
   or a - array['workflowId','executionId','actionLogId','succeeded','completedAt'] <> '{}'::jsonb then raise exception 'native_evidence_invalid'; end if;
 end loop;
 for w in select value from jsonb_array_elements(p_evidence->'absence'->'workflows') loop
  if w->'activeExecutionIds' is distinct from '[]'::jsonb
   or coalesce(w->>'evidenceRef','') !~ '^[a-zA-Z][a-zA-Z0-9_-]*:[a-zA-Z0-9_:./-]{1,240}$'
   or w - array['workflowId','activeExecutionIds','evidenceRef'] <> '{}'::jsonb then raise exception 'native_evidence_invalid'; end if;
 end loop;
 update meulocal_opt_out_sync set status='synchronized',native_receipt=p_evidence,evidence_ref=p_evidence->>'evidenceRef',error_code=null,updated_at=now()
  where location_id=p_location_id and contact_id=p_contact_id;
 insert into outreach_events(lead_id,channel,event_type,provider,message_key,metadata)
  values(p_lead_id,'system','unsubscribed','meulocal','native_opt_out_reconciliation',jsonb_build_object('locationId',p_location_id,'contactId',p_contact_id,
   'attemptId',p_attempt_id,'phase','late_evidence_verified','previousStatus',p_expected_status,'correlationId',p_evidence->>'correlationId','evidenceRef',p_evidence->>'evidenceRef'));
 return jsonb_build_object('recorded',true,'duplicate',false);
end $$;
revoke all on function public.reconcile_meulocal_native_opt_out(text,text,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.reconcile_meulocal_native_opt_out(text,text,uuid,uuid,text,jsonb) to service_role;

-- Preserve old signatures while preventing API/native strategy mixing and renewing only retryable claims.
create or replace function public.claim_meulocal_opt_out_sync(p_location_id text,p_contact_id text,p_lead_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog,public as $$
declare r public.meulocal_opt_out_sync; acquired boolean; next_attempt uuid; previous_native_plan jsonb;
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
  previous_native_plan:=r.native_plan;
  acquired := r.status in ('pending','blocked','failed');
  -- No expiring lease: crashes/unknown remote results require reconciliation before replay.
  if acquired then
    next_attempt := gen_random_uuid();
    update public.meulocal_opt_out_sync set status='in_progress',attempt_id=next_attempt,error_code=null,native_plan=null,native_binding=null,native_receipt=null,updated_at=now()
      where location_id=p_location_id and contact_id=p_contact_id returning * into r;
  end if;
  insert into public.outreach_events(lead_id,channel,event_type,provider,message_key,metadata)
    values(p_lead_id,'system','unsubscribed','meulocal','rcia_opt_out_sync',
      jsonb_build_object('locationId',p_location_id,'contactId',p_contact_id,'attemptId',r.attempt_id,
        'previousNativePlan',case when acquired then previous_native_plan else null end,
        'phase',case when acquired then 'claimed' else 'duplicate' end,'status',r.status));
  return jsonb_build_object('acquired',acquired,'status',r.status,'attemptId',r.attempt_id,'confirmed',r.confirmed,'nativeIntent',r.native_plan is not null);
end $$;

create or replace function public.record_meulocal_opt_out_sync(p_location_id text,p_contact_id text,p_attempt_id uuid,
  p_status text,p_confirmed jsonb,p_evidence_ref text,p_error text)
returns boolean language plpgsql security definer set search_path = pg_catalog,public as $$
declare r public.meulocal_opt_out_sync; entry jsonb;
begin
  perform 1 from leads where ghl_location_id=p_location_id and ghl_contact_id=p_contact_id and opt_out_at is not null
    and id=(select lead_id from meulocal_opt_out_sync where location_id=p_location_id and contact_id=p_contact_id) for update;
  if not found then raise exception 'opt_out_scope_unverified'; end if;
  select * into strict r from public.meulocal_opt_out_sync
    where location_id=p_location_id and contact_id=p_contact_id for update;
  if r.native_plan is not null and (p_status='synchronized' or p_confirmed<>'[]'::jsonb) then raise exception 'native_evidence_requires_reconciliation'; end if;
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
