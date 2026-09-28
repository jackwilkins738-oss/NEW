-- Saved starting points for quotes (components/QuotesPanel.tsx): a named set
-- of lines plus markup, VAT, deposit and wording, so a trade's standard jobs
-- ("Full re-roof", "Boiler swap", "Consumer unit upgrade") are one pick away
-- instead of typed from scratch each time.
create table if not exists quote_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  line_items jsonb not null default '[]',
  markup_percent numeric(6, 2) not null default 0,
  vat_rate numeric(5, 2) not null default 20,
  deposit_pence bigint,
  payment_terms text,
  exclusions text,
  terms text,
  created_at timestamptz not null default now()
);

create index if not exists quote_templates_tenant_idx on quote_templates(tenant_id, name);

alter table quote_templates enable row level security;

drop policy if exists "member can manage own quote templates" on quote_templates;
create policy "member can manage own quote templates" on quote_templates
  for all using (
    exists (select 1 from memberships m where m.tenant_id = quote_templates.tenant_id and m.user_id = auth.uid())
  ) with check (
    exists (select 1 from memberships m where m.tenant_id = quote_templates.tenant_id and m.user_id = auth.uid())
  );
