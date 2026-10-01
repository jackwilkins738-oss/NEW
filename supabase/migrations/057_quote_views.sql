-- When a customer opens their quote (app/quote/[id]/[token]/page.tsx).
-- "Opened 3 times, last an hour ago" tells a business who's weighing it up
-- right now - the best moment to ring - and "not opened yet" that the chaser
-- should be "did you get it?", not "any thoughts?". The first open also sends
-- a phone notification.
--
-- Only the service role records a view (the public page reads quotes with the
-- admin client already); the function does the count in one statement so two
-- tabs opening at once can't both look like the first view.
alter table quotes add column if not exists view_count int not null default 0;
alter table quotes add column if not exists first_viewed_at timestamptz;
alter table quotes add column if not exists last_viewed_at timestamptz;

create or replace function record_quote_view(q uuid) returns int as $$
  update quotes
     set view_count = view_count + 1,
         first_viewed_at = coalesce(first_viewed_at, now()),
         last_viewed_at = now()
   where id = q
  returning view_count;
$$ language sql security definer set search_path = public;

revoke all on function record_quote_view(uuid) from public, anon, authenticated;
grant execute on function record_quote_view(uuid) to service_role;
