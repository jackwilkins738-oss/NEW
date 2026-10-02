-- 059: what a prospect actually did on their preview page, not just that it loaded.
--
-- engaged_seconds  time the page was on screen in front of them, all visits added up (capped per visit)
-- max_scroll       how far down they got, 0-100 (%)
-- reached          which sections they scrolled to (loading, rebuilt, race, findings, pricing, reply)
-- choice           a one-tap answer from the page: call (ring me), whatsapp, not_now
--
-- Engagement facts only, like the rest of this table: no phone number or message is stored here -
-- a number they type for "ring me" goes straight to the owner's Telegram and nowhere else.
-- Written only by the service role through the two functions below.

alter table prospects add column if not exists engaged_seconds int not null default 0;
alter table prospects add column if not exists max_scroll int not null default 0;
alter table prospects add column if not exists reached text[] not null default '{}';
alter table prospects add column if not exists choice text check (choice in ('call', 'whatsapp', 'not_now'));
alter table prospects add column if not exists choice_at timestamptz;

create or replace function record_prospect_engagement(p_slug text, p_seconds int, p_scroll int, p_reached text[])
returns void
language sql
as $$
  update prospects
  set engaged_seconds = prospects.engaged_seconds + least(greatest(coalesce(p_seconds, 0), 0), 1800),
      max_scroll = greatest(prospects.max_scroll, least(greatest(coalesce(p_scroll, 0), 0), 100)),
      reached = array(
        select distinct s from unnest(prospects.reached || coalesce(p_reached, '{}')) as s
        where s in ('loading', 'rebuilt', 'race', 'findings', 'pricing', 'reply')
      ),
      updated_at = now()
  where prospects.slug = p_slug;
$$;

create or replace function record_prospect_choice(p_slug text, p_choice text)
returns table (business_name text, trade text, area text, view_count int, choice text)
language sql
as $$
  update prospects
  set choice = p_choice,
      choice_at = now(),
      status = case when p_choice in ('call', 'whatsapp') and prospects.status in ('new', 'contacted', 'viewed') then 'replied'
                    else prospects.status end,
      updated_at = now()
  where prospects.slug = p_slug and p_choice in ('call', 'whatsapp', 'not_now')
  returning prospects.business_name, prospects.trade, prospects.area, prospects.view_count, prospects.choice;
$$;

revoke all on function record_prospect_engagement(text, int, int, text[]) from public, anon, authenticated;
revoke all on function record_prospect_choice(text, text) from public, anon, authenticated;
