create table suppliers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  contact_name text,
  account_number text,
  phone text,
  email text,
  categories text, -- free text, e.g. "Timber, Roofing"
  created_at timestamptz not null default now()
);

create index suppliers_tenant_idx on suppliers(tenant_id, name);

alter table suppliers enable row level security;

create policy "member can manage own suppliers" on suppliers
  for all using (
    exists (select 1 from memberships m where m.tenant_id = suppliers.tenant_id and m.user_id = auth.uid())
  ) with check (
    exists (select 1 from memberships m where m.tenant_id = suppliers.tenant_id and m.user_id = auth.uid())
  );
