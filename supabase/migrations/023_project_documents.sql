-- Generic project documents (contracts, drawings, plans, RAMS,
-- certificates, insurance, purchase orders) - separate from project_photos
-- because these are private business documents, not something to publish
-- to the customer's own website the way photos are.
create table project_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  storage_path text not null, -- path within the 'project-documents' bucket, e.g. "<tenant_id>/<uuid>-<filename>"
  filename text not null,
  category text not null default 'other', -- contract | drawings | plans | rams | certificate | insurance | purchase_order | other
  created_at timestamptz not null default now()
);

create index project_documents_tenant_idx on project_documents(tenant_id, created_at desc);
create index project_documents_project_idx on project_documents(project_id);

alter table project_documents enable row level security;

create policy "member can manage own project documents" on project_documents
  for all using (
    exists (select 1 from memberships m where m.tenant_id = project_documents.tenant_id and m.user_id = auth.uid())
  ) with check (
    exists (select 1 from memberships m where m.tenant_id = project_documents.tenant_id and m.user_id = auth.uid())
  );

-- Private bucket (unlike project-photos) - these are real business
-- documents, not meant to be public. Reads go through a signed URL
-- generated server-side by a member's own session, not a public CDN link.
insert into storage.buckets (id, name, public)
values ('project-documents', 'project-documents', false)
on conflict (id) do nothing;

create policy "member can upload own tenant documents" on storage.objects
  for insert with check (
    bucket_id = 'project-documents'
    and exists (
      select 1 from memberships m
      where m.user_id = auth.uid()
      and (storage.foldername(name))[1] = m.tenant_id::text
    )
  );

create policy "member can read own tenant documents" on storage.objects
  for select using (
    bucket_id = 'project-documents'
    and exists (
      select 1 from memberships m
      where m.user_id = auth.uid()
      and (storage.foldername(name))[1] = m.tenant_id::text
    )
  );

create policy "member can delete own tenant documents" on storage.objects
  for delete using (
    bucket_id = 'project-documents'
    and exists (
      select 1 from memberships m
      where m.user_id = auth.uid()
      and (storage.foldername(name))[1] = m.tenant_id::text
    )
  );
