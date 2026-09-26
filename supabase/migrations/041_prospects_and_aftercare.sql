-- Two additions for running Scalar Digital's own sales through this same
-- dashboard (it's a tenant here too, via its track.js snippet).
--
-- 1. prospects: businesses Scalar is reaching out to, each with a private
--    preview page on scalardigital.co.uk (/for/<slug>). Deliberately a
--    separate table from leads: a lead is someone who contacted the tenant;
--    a prospect is someone the tenant contacted. Putting prospects through
--    /api/leads would send every one of them the "thanks for getting in
--    touch" auto-reply - to people who never got in touch.
--
--    Rows only ever arrive through /api/prospects/import (service role,
--    guarded by PROSPECTS_API_SECRET), so there's no insert or delete
--    policy at all. Members can read and update (status) their own.
--
--    The data lives here and not in the website's repo because both repos
--    are public: a prospect list committed there would be readable by
--    anyone. The slug carries a short hash so preview URLs can't be guessed
--    from a business name.
create table if not exists prospects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  business_name text not null check (length(business_name) between 1 and 120),
  trade text check (length(trade) <= 60),
  area text check (length(area) <= 80),
  website text check (length(website) <= 200),
  mobile_score int check (mobile_score between 0 and 100),
  lcp_s numeric(5, 1) check (lcp_s >= 0 and lcp_s < 1000),
  channel text not null default 'email' check (channel in ('email', 'letter', 'phone')),
  status text not null default 'new' check (status in ('new', 'contacted', 'viewed', 'replied', 'won', 'lost')),
  view_count int not null default 0,
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists prospects_tenant_idx on prospects(tenant_id, created_at desc);
create index if not exists prospects_tenant_viewed_idx on prospects(tenant_id, last_viewed_at desc);

alter table prospects enable row level security;

create policy "member can read own prospects" on prospects
  for select using (
    exists (select 1 from memberships m where m.tenant_id = prospects.tenant_id and m.user_id = auth.uid())
  );

create policy "member can update own prospects" on prospects
  for update using (
    exists (select 1 from memberships m where m.tenant_id = prospects.tenant_id and m.user_id = auth.uid())
  ) with check (
    exists (select 1 from memberships m where m.tenant_id = prospects.tenant_id and m.user_id = auth.uid())
  );

-- Atomic "someone opened this preview": one statement, so two views landing
-- at the same moment can't both read the old count. Returns the new count
-- so the caller can say "2nd visit". Only the service role calls this.
create or replace function record_prospect_view(p_slug text)
returns table (business_name text, trade text, area text, website text, mobile_score int, view_count int, status text)
language sql
as $$
  update prospects
  set view_count = prospects.view_count + 1,
      first_viewed_at = coalesce(prospects.first_viewed_at, now()),
      last_viewed_at = now(),
      status = case when prospects.status in ('new', 'contacted') then 'viewed' else prospects.status end,
      updated_at = now()
  where prospects.slug = p_slug
  returning prospects.business_name, prospects.trade, prospects.area, prospects.website,
            prospects.mobile_score, prospects.view_count, prospects.status;
$$;

revoke all on function record_prospect_view(text) from public, anon, authenticated;

-- 2. Aftercare dates for each customer business. launched_on is set by hand
--    from /admin once their site goes live; nothing is reminded until it is.
--    free_hosting_months is 12 normally, 24 for founding clients.
--
--    Neither column is added to the anon/authenticated column grant from
--    migration 039 - they're only ever read through the admin client
--    (/admin and the aftercare cron), same as every tenant column since 021.
alter table tenants add column if not exists launched_on date;
alter table tenants add column if not exists free_hosting_months int not null default 12
  check (free_hosting_months between 0 and 60);
