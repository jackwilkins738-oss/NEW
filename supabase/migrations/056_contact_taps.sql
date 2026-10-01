-- Taps on a client's call, WhatsApp and email links (app/track.js/route.ts).
-- For a trade, most enquiries are phone calls - a dashboard that only counts
-- form enquiries undersells the website by a mile, right when the client is
-- deciding whether the £39/month is worth it. A tap is the closest a website
-- can see to a call (it can't know whether it connected), so it's counted as
-- "taps", never "calls made".
--
-- Stored as a pageview row with a kind, so the existing insert policy (valid
-- site_key) and rate limit (040) cover it with nothing new exposed. Page view
-- counts exclude rows with a kind.
alter table pageviews add column if not exists kind text;

do $$ begin
  alter table pageviews add constraint pageviews_kind_check check (kind is null or kind in ('call', 'whatsapp', 'email'));
exception when duplicate_object then null; end $$;

create index if not exists pageviews_tenant_kind_idx on pageviews(tenant_id, created_at desc) where kind is not null;
