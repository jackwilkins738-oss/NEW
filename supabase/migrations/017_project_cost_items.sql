-- Real line-item costs, replacing the five flat *_cost_pence totals added in
-- 015. Each item is committed the moment it's logged (an order placed, a
-- subcontractor booked) and flipped to "paid" once the invoice/receipt is
-- actually settled - so "committed cost" (every item) and "actual cost"
-- (paid items only) both come out of the same table instead of needing
-- separate tracking. "Budgeted cost" isn't stored here at all: it's read
-- straight off the originating quote's line_items (projects.quote_id),
-- grouped by category, wherever the budget/committed/actual comparison is
-- shown.
--
-- The old materials_cost_pence/labour_cost_pence/subcontractor_cost_pence/
-- plant_cost_pence/other_cost_pence columns on projects are left in place
-- (not dropped - a couple of real projects may already have numbers in
-- them) but the app stops reading/writing them from this point on.
create table project_cost_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  category text not null default 'other', -- materials | labour | subcontractors | plant | other
  description text,
  supplier text,
  amount_pence bigint not null default 0,
  status text not null default 'committed', -- committed | paid
  cost_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

create index project_cost_items_project_idx on project_cost_items(project_id, cost_date desc);
create index project_cost_items_tenant_idx on project_cost_items(tenant_id);

alter table project_cost_items enable row level security;

create policy "member can manage own project cost items" on project_cost_items
  for all using (
    exists (select 1 from memberships m where m.tenant_id = project_cost_items.tenant_id and m.user_id = auth.uid())
  ) with check (
    exists (select 1 from memberships m where m.tenant_id = project_cost_items.tenant_id and m.user_id = auth.uid())
  );
