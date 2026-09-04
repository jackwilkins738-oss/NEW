-- Run in the Supabase SQL editor.

-- One Google Calendar connection per login (not per tenant - the calendar
-- belongs to the person, not the business). RLS is enabled with no
-- policies at all, on purpose: this table holds OAuth tokens, so it should
-- never be reachable via the anon/authenticated client no matter what -
-- every touch goes through the service-role admin client from server code
-- (see lib/supabase/admin.ts), the same way platform_admins is protected.
create table calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  token_expires_at timestamptz not null,
  google_calendar_id text not null default 'primary',
  connected_at timestamptz not null default now()
);

alter table calendar_connections enable row level security;

-- Tracks the Google Calendar event created for a project's next site visit,
-- so a later date change updates that same event instead of duplicating it.
alter table projects add column google_event_id text;
