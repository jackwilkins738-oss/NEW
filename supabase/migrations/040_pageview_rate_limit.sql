-- Pageviews go straight from the browser to Supabase's REST API (see
-- app/track.js/route.ts) - there's no Next.js route in the middle the way
-- /api/leads has one, so there's nowhere in application code to put a rate
-- limit the way 008_lead_rate_limit.sql did for leads. Enforced here
-- instead, as a BEFORE INSERT trigger: PostgREST exposes the original
-- request's headers to Postgres via the `request.headers` setting, which is
-- how the IP gets captured without the client sending one itself (a client
-- claiming its own IP wouldn't be trustworthy anyway).
--
-- Generous limit (pageviews are legitimately frequent - every page load,
-- not just a form submit) - this is meant to stop a script hammering the
-- endpoint, not to be a normal ceiling any real visitor could hit.
alter table pageviews add column if not exists ip text;
create index if not exists pageviews_tenant_ip_idx on pageviews(tenant_id, ip, created_at desc);

create or replace function pageviews_rate_limit() returns trigger as $$
declare
  client_ip text;
  recent_count int;
begin
  client_ip := coalesce(
    (current_setting('request.headers', true)::json ->> 'x-forwarded-for'),
    'unknown'
  );
  -- x-forwarded-for can be a comma-separated chain (proxy hops) - the first
  -- entry is the original client, same convention app/api/contact/route.ts
  -- and app/api/leads/route.ts already use.
  client_ip := split_part(client_ip, ',', 1);
  new.ip := client_ip;

  select count(*) into recent_count
  from pageviews
  where tenant_id = new.tenant_id
    and ip = client_ip
    and created_at > now() - interval '5 minutes';

  if recent_count >= 100 then
    raise exception 'rate limit exceeded';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists pageviews_rate_limit_trigger on pageviews;
create trigger pageviews_rate_limit_trigger
  before insert on pageviews
  for each row execute function pageviews_rate_limit();
