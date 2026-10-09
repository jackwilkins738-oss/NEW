-- Job posts (Local Growth, Growth plan and up): each finished job with photos
-- becomes a page on the client's own website and a Google Business Profile
-- post. The owner's panel drafts them from the job's facts and photos
-- (/api/job-posts), the client approves or edits them on /posts, and the
-- panel builds the approved ones into their site and marks them published.
create table if not exists job_posts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'approved', 'skipped', 'published')),
  title text not null check (char_length(title) between 1 and 120),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  body text not null check (char_length(body) between 1 and 6000),
  google_post text not null default '' check (char_length(google_post) <= 1500),
  town text,
  service text,
  photos jsonb not null default '[]'::jsonb,
  page_url text,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  published_at timestamptz,
  unique (project_id),
  unique (tenant_id, slug)
);
create index if not exists job_posts_tenant_idx on job_posts(tenant_id, status, created_at desc);

alter table job_posts enable row level security;

drop policy if exists "member can read own job posts" on job_posts;
create policy "member can read own job posts" on job_posts
  for select using (exists (select 1 from memberships m where m.tenant_id = job_posts.tenant_id and m.user_id = auth.uid()));

-- Members edit, approve or skip their drafts; only the panel (service role) marks one published.
drop policy if exists "member can review own job posts" on job_posts;
create policy "member can review own job posts" on job_posts
  for update using (
    status in ('draft', 'approved', 'skipped')
    and exists (select 1 from memberships m where m.tenant_id = job_posts.tenant_id and m.user_id = auth.uid())
  ) with check (
    status in ('draft', 'approved', 'skipped')
    and exists (select 1 from memberships m where m.tenant_id = job_posts.tenant_id and m.user_id = auth.uid())
  );
