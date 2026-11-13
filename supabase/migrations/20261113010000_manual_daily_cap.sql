-- Conta os envios manuais já reservados/enviados hoje (dia de America/Sao_Paulo).
-- Somente leitura; o limite em si é decidido pela rota send-manual.
create or replace function public.manual_sends_today()
returns integer language sql stable security definer set search_path=public,pg_temp as $$
 select count(*)::integer from outreach_events
 where dispatch_kind='manual'
   and dispatch_state in ('reserved','dispatching','sent','ambiguous')
   and created_at>=(date_trunc('day',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo');
$$;
revoke all on function public.manual_sends_today() from public,anon,authenticated;
grant execute on function public.manual_sends_today() to service_role;
