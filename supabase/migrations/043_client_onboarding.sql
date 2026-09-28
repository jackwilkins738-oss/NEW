-- Client onboarding: once a firm accepts a quote Scalar sent from its
-- outreach (POST /api/prospects/quote), they get a private page
-- (/onboarding/<id>/<token>) to hand over everything the build needs in one
-- go - services, towns covered, guarantee, insurance, reviews link, who holds
-- the domain - and to upload their logo and photos of their work. It replaces
-- the week of back-and-forth emails that usually follows a "yes".
--
-- Only quotes made by /api/prospects/quote get an onboarding row, so no other
-- tenant's customers ever see this. Like the quote page, the token in the URL
-- is the security boundary: every public read and write goes through the
-- service-role client after a token match, so there are no anon policies at
-- all. Members can read their own tenant's rows (the /onboarding page).
create table if not exists onboarding (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  quote_id uuid not null unique references quotes(id) on delete cascade,
  token text not null check (length(token) >= 32),
  client_name text not null check (length(client_name) between 1 and 120),
  -- The outreach prospect this came from, so accepting the quote marks it won.
  prospect_slug text check (prospect_slug is null or length(prospect_slug) <= 80),
  answers jsonb not null default '{}'::jsonb
    check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) < 32768),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists onboarding_tenant_idx on onboarding(tenant_id, created_at desc);

alter table onboarding enable row level security;

create policy "member can read own onboarding" on onboarding
  for select using (
    exists (select 1 from memberships m where m.tenant_id = onboarding.tenant_id and m.user_id = auth.uid())
  );

-- One row per uploaded file. storage_path is within the private
-- 'onboarding-uploads' bucket: <tenant_id>/<onboarding_id>/<uuid>-<name>.
create table if not exists onboarding_files (
  id uuid primary key default gen_random_uuid(),
  onboarding_id uuid not null references onboarding(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  storage_path text not null unique,
  filename text not null check (length(filename) between 1 and 200),
  kind text not null check (kind in ('logo', 'photo', 'other')),
  size_bytes int not null check (size_bytes > 0),
  created_at timestamptz not null default now()
);

create index if not exists onboarding_files_onboarding_idx on onboarding_files(onboarding_id, created_at);

alter table onboarding_files enable row level security;

create policy "member can read own onboarding files" on onboarding_files
  for select using (
    exists (select 1 from memberships m where m.tenant_id = onboarding_files.tenant_id and m.user_id = auth.uid())
  );

-- Private bucket. Uploads arrive through one-off signed upload URLs issued by
-- the server after a token match (so large phone photos go straight to
-- storage, not through a Vercel function's 4.5 MB body limit). The bucket
-- itself refuses anything over 15 MB or that isn't an image or PDF.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'onboarding-uploads', 'onboarding-uploads', false, 15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif', 'application/pdf']
)
on conflict (id) do nothing;

create policy "member can read own onboarding uploads" on storage.objects
  for select using (
    bucket_id = 'onboarding-uploads'
    and exists (
      select 1 from memberships m
      where m.user_id = auth.uid()
      and (storage.foldername(name))[1] = m.tenant_id::text
    )
  );
