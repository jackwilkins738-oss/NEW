-- Run this in the Supabase SQL editor. Adds the /admin screen's backing
-- table and the two extra RLS policies it needs (tenant creation and
-- membership creation are otherwise locked down to nobody, on purpose).

create table if not exists platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table platform_admins enable row level security;

create policy "self can read own admin row" on platform_admins
  for select using (user_id = auth.uid());

create policy "platform admin can create tenants" on tenants
  for insert with check (
    exists (select 1 from platform_admins pa where pa.user_id = auth.uid())
  );

create policy "platform admin can create memberships" on memberships
  for insert with check (
    exists (select 1 from platform_admins pa where pa.user_id = auth.uid())
  );

-- Bootstrap step (there's no UI for this - it would be a chicken-and-egg
-- problem): make your own existing login a platform admin. Find your user id
-- in Authentication -> Users, then:
--
-- insert into platform_admins (user_id) values ('<your auth user id>');
