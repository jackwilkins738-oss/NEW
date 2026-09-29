-- Looking after Scalar Digital's own clients (the tenants of this dashboard).
--
-- Billing (lib/billing.ts): the £39/month dashboard fee as a Stripe
-- subscription on Scalar's own Stripe account. The card goes in at any time
-- and the first charge waits until the free period ends.
alter table tenants add column if not exists billing_status text check (billing_status is null or billing_status in ('active', 'trialing', 'past_due', 'cancelled'));
alter table tenants add column if not exists stripe_subscription_id text;

-- Change requests (app/help): a client asks for a change to their website
-- from their own dashboard; it lands on /admin and in the admin's inbox.
create table if not exists change_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  message text not null check (char_length(message) between 1 and 4000),
  status text not null default 'open' check (status in ('open', 'done')),
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists change_requests_open_idx on change_requests(status, created_at desc);

alter table change_requests enable row level security;

drop policy if exists "member can read own change requests" on change_requests;
create policy "member can read own change requests" on change_requests
  for select using (exists (select 1 from memberships m where m.tenant_id = change_requests.tenant_id and m.user_id = auth.uid()));

drop policy if exists "member can add change requests" on change_requests;
create policy "member can add change requests" on change_requests
  for insert with check (
    status = 'open' and created_by = auth.uid()
    and exists (select 1 from memberships m where m.tenant_id = change_requests.tenant_id and m.user_id = auth.uid())
  );
