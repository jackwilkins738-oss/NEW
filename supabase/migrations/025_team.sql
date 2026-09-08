-- No HR software - just enough to feed scheduling and labour costing.
create table team_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  role text,
  phone text,
  email text,
  cost_per_hour_pence bigint,
  created_at timestamptz not null default now()
);

create index team_members_tenant_idx on team_members(tenant_id, name);

alter table team_members enable row level security;

create policy "member can manage own team" on team_members
  for all using (
    exists (select 1 from memberships m where m.tenant_id = team_members.tenant_id and m.user_id = auth.uid())
  ) with check (
    exists (select 1 from memberships m where m.tenant_id = team_members.tenant_id and m.user_id = auth.uid())
  );

-- Which team members are on a given project - a project can have several,
-- a person can be on several projects, hence the join table rather than a
-- single column on either side.
create table project_team_members (
  project_id uuid not null references projects(id) on delete cascade,
  team_member_id uuid not null references team_members(id) on delete cascade,
  primary key (project_id, team_member_id)
);

alter table project_team_members enable row level security;

create policy "member can manage own project team assignments" on project_team_members
  for all using (
    exists (
      select 1 from projects p
      join memberships m on m.tenant_id = p.tenant_id
      where p.id = project_team_members.project_id and m.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from projects p
      join memberships m on m.tenant_id = p.tenant_id
      where p.id = project_team_members.project_id and m.user_id = auth.uid()
    )
  );
