-- Run this in the Supabase SQL editor on any project that already ran
-- schema.sql before invoices existed. (New projects get this straight from
-- the updated schema.sql - no need to run this file too.)

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  client_name text not null,
  reference text,
  amount_pence bigint not null,
  due_date date not null,
  status text not null default 'unpaid', -- unpaid | paid
  created_at timestamptz not null default now()
);

create index if not exists invoices_tenant_idx on invoices(tenant_id, due_date asc);

alter table invoices enable row level security;

create policy "member can manage own invoices" on invoices
  for all using (
    exists (select 1 from memberships m where m.tenant_id = invoices.tenant_id and m.user_id = auth.uid())
  ) with check (
    exists (select 1 from memberships m where m.tenant_id = invoices.tenant_id and m.user_id = auth.uid())
  );
