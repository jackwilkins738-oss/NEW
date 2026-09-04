-- Run in the Supabase SQL editor on any project that already ran
-- schema.sql before trade_capacity existed.

create table if not exists trade_capacity (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  trade_name text not null,
  percent_booked int not null default 0 check (percent_booked >= 0 and percent_booked <= 100),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, trade_name)
);

alter table trade_capacity enable row level security;

create policy "member can manage own trade capacity" on trade_capacity
  for all using (
    exists (select 1 from memberships m where m.tenant_id = trade_capacity.tenant_id and m.user_id = auth.uid())
  ) with check (
    exists (select 1 from memberships m where m.tenant_id = trade_capacity.tenant_id and m.user_id = auth.uid())
  );
