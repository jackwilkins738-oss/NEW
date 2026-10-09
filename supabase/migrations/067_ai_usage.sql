-- AI drafts made from the dashboard (lib/ai.ts), one row each, so each
-- client's daily use can be capped - the Anthropic bill is Scalar's.
-- Written and read only by the server (service role): no policies.
create table if not exists ai_usage (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  kind text not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_tenant_idx on ai_usage(tenant_id, kind, created_at desc);
alter table ai_usage enable row level security;
