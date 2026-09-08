-- Phase 1/2 roadmap: a shared customer entity, a value on leads (so pipeline
-- value can be estimated before a lead becomes a project), and a lead ->
-- project link so "won" isn't just a status label - it's a real conversion.
--
-- customers is intentionally lightweight (name/email/phone/address/notes)
-- and additive: existing projects.client_name / invoices.client_name stay
-- as free text for backward compatibility with rows that predate this, the
-- new customer_id columns are nullable and only populated going forward.
create table customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customers_tenant_idx on customers(tenant_id, name);

alter table customers enable row level security;

create policy "member can manage own customers" on customers
  for all using (
    exists (select 1 from memberships m where m.tenant_id = customers.tenant_id and m.user_id = auth.uid())
  ) with check (
    exists (select 1 from memberships m where m.tenant_id = customers.tenant_id and m.user_id = auth.uid())
  );

alter table leads add column value_pence bigint;

alter table projects add column lead_id uuid references leads(id) on delete set null;
alter table projects add column customer_id uuid references customers(id) on delete set null;
alter table invoices add column customer_id uuid references customers(id) on delete set null;

create index projects_lead_idx on projects(lead_id);
create index projects_customer_idx on projects(customer_id);
create index invoices_customer_idx on invoices(customer_id);
