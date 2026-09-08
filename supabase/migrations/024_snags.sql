create table snags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  description text not null,
  location text,
  assigned_to text,
  due_date date,
  status text not null default 'open', -- open | assigned | complete
  created_at timestamptz not null default now()
);

create index snags_project_idx on snags(project_id, created_at desc);

alter table snags enable row level security;

create policy "member can manage own snags" on snags
  for all using (
    exists (select 1 from memberships m where m.tenant_id = snags.tenant_id and m.user_id = auth.uid())
  ) with check (
    exists (select 1 from memberships m where m.tenant_id = snags.tenant_id and m.user_id = auth.uid())
  );
