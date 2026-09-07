-- Self-service "currently on site" photo gallery. The customer uploads
-- these themselves from the dashboard, no help needed - they show up on
-- their public site automatically via /gallery.js. Run this in the
-- Supabase SQL editor.

create table if not exists project_photos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid references projects(id) on delete set null, -- optional link, not required
  storage_path text not null,  -- path within the 'project-photos' storage bucket, e.g. "<tenant_id>/<uuid>.jpg"
  caption text,
  created_at timestamptz not null default now()
);

create index if not exists project_photos_tenant_idx on project_photos(tenant_id, created_at desc);

alter table project_photos enable row level security;

create policy "member can manage own project photos" on project_photos
  for all using (
    exists (select 1 from memberships m where m.tenant_id = project_photos.tenant_id and m.user_id = auth.uid())
  ) with check (
    exists (select 1 from memberships m where m.tenant_id = project_photos.tenant_id and m.user_id = auth.uid())
  );

-- Photos and captions aren't sensitive - they're published on the
-- customer's own site - so public read is intentional, same reasoning as
-- "anyone can read tenant directory" in schema.sql.
create policy "public can read project photos" on project_photos
  for select using (true);

-- Storage bucket, public read (served straight from Supabase's CDN, no
-- app code in the path), writes gated by the <tenant_id>/... path prefix
-- matching an actual membership.
insert into storage.buckets (id, name, public)
values ('project-photos', 'project-photos', true)
on conflict (id) do nothing;

create policy "member can upload own tenant photos" on storage.objects
  for insert with check (
    bucket_id = 'project-photos'
    and exists (
      select 1 from memberships m
      where m.user_id = auth.uid()
      and (storage.foldername(name))[1] = m.tenant_id::text
    )
  );

create policy "member can delete own tenant photos" on storage.objects
  for delete using (
    bucket_id = 'project-photos'
    and exists (
      select 1 from memberships m
      where m.user_id = auth.uid()
      and (storage.foldername(name))[1] = m.tenant_id::text
    )
  );

create policy "public can view project photos" on storage.objects
  for select using (bucket_id = 'project-photos');
