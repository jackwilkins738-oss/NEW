-- Variations: "customer asks for extra work" -> approve -> it adds to the
-- project's value and (optionally) becomes an invoice. Cost is split the
-- same way Jack described it (materials/labour/other), separate from
-- customer_price_pence - what's actually charged, which is what approving
-- adds to projects.value_pence, not the raw cost.
create table variations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  number text,
  description text not null,
  materials_cost_pence bigint not null default 0,
  labour_cost_pence bigint not null default 0,
  other_cost_pence bigint not null default 0,
  customer_price_pence bigint not null default 0,
  additional_days int,
  status text not null default 'pending', -- pending | approved | declined
  approved_at timestamptz,
  invoice_id uuid references invoices(id) on delete set null,
  created_at timestamptz not null default now()
);

create index variations_project_idx on variations(project_id, created_at desc);

alter table variations enable row level security;

create policy "member can manage own variations" on variations
  for all using (
    exists (select 1 from memberships m where m.tenant_id = variations.tenant_id and m.user_id = auth.uid())
  ) with check (
    exists (select 1 from memberships m where m.tenant_id = variations.tenant_id and m.user_id = auth.uid())
  );
