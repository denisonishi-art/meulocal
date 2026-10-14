-- Exactly one attempt per mapped lead for the OpenDots initial acquisition message.
-- Reserve before calling HighLevel; failed/ambiguous sends require manual reconciliation.
CREATE UNIQUE INDEX IF NOT EXISTS outreach_events_opendots_initial_once
  ON public.outreach_events (lead_id, message_key)
  WHERE message_key = 'opendots_initial_v1';
