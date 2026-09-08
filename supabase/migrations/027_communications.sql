create table communications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  type text not null default 'note', -- email | sms | call | note
  summary text not null,
  created_at timestamptz not null default now()
);

create index communications_project_idx on communications(project_id, created_at desc);

alter table communications enable row level security;

create policy "member can manage own communications" on communications
  for all using (
    exists (select 1 from memberships m where m.tenant_id = communications.tenant_id and m.user_id = auth.uid())
  ) with check (
    exists (select 1 from memberships m where m.tenant_id = communications.tenant_id and m.user_id = auth.uid())
  );
