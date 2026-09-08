create table reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  customer_name text not null,
  rating int check (rating between 1 and 5),
  review_text text,
  status text not null default 'requested', -- requested | received
  published boolean not null default false, -- shown on the public testimonials embed
  requested_at timestamptz not null default now(),
  received_at timestamptz
);

create index reviews_tenant_idx on reviews(tenant_id, requested_at desc);
create index reviews_project_idx on reviews(project_id);

alter table reviews enable row level security;

create policy "member can manage own reviews" on reviews
  for all using (
    exists (select 1 from memberships m where m.tenant_id = reviews.tenant_id and m.user_id = auth.uid())
  ) with check (
    exists (select 1 from memberships m where m.tenant_id = reviews.tenant_id and m.user_id = auth.uid())
  );

-- Only received AND explicitly published reviews are public - a
-- "requested" review, or a received one the owner hasn't chosen to
-- publish, stays private.
create policy "public can read published reviews" on reviews
  for select using (published = true and status = 'received');
