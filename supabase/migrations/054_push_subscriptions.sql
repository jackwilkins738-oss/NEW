-- Phone notifications (lib/push.ts): each person who taps "Turn on" gets a
-- row for that device. A new enquiry or an accepted quote is pushed to every
-- device of every member of that business. Rows for devices that have gone
-- away (the push service says 404/410) are deleted as they're found.
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) <= 1000 and endpoint like 'https://%'),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_tenant_idx on push_subscriptions(tenant_id);

alter table push_subscriptions enable row level security;

drop policy if exists "users manage their own devices" on push_subscriptions;
create policy "users manage their own devices" on push_subscriptions
  for all using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from memberships m where m.tenant_id = push_subscriptions.tenant_id and m.user_id = auth.uid())
  );
