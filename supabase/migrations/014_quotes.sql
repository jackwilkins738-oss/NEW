-- Quote builder: a lead or customer can be quoted, and an accepted quote
-- converts straight into a project (same conversion pattern as a won lead
-- already has). Digital/customer-facing acceptance is deliberately left out
-- of this pass - status changes are owner-driven for now, the same trust
-- model invoices already use.
create table quotes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  customer_id uuid references customers(id) on delete set null,
  client_name text not null,
  reference text,
  line_items jsonb not null default '[]', -- [{description, unit_price_pence}]
  total_pence bigint not null default 0,
  status text not null default 'draft', -- draft | sent | accepted | declined
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index quotes_tenant_idx on quotes(tenant_id, created_at desc);

alter table quotes enable row level security;

create policy "member can manage own quotes" on quotes
  for all using (
    exists (select 1 from memberships m where m.tenant_id = quotes.tenant_id and m.user_id = auth.uid())
  ) with check (
    exists (select 1 from memberships m where m.tenant_id = quotes.tenant_id and m.user_id = auth.uid())
  );

alter table projects add column quote_id uuid references quotes(id) on delete set null;
create index projects_quote_idx on projects(quote_id);
