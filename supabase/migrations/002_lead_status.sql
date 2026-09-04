-- Run this in the Supabase SQL editor on any project that already ran
-- schema.sql before lead status tracking existed. (New projects get this
-- straight from the updated schema.sql - no need to run this file too.)

alter table leads add column if not exists status text not null default 'new';
alter table leads add column if not exists status_updated_at timestamptz not null default now();

create policy "member can update own leads" on leads
  for update using (
    exists (select 1 from memberships m where m.tenant_id = leads.tenant_id and m.user_id = auth.uid())
  ) with check (
    exists (select 1 from memberships m where m.tenant_id = leads.tenant_id and m.user_id = auth.uid())
  );
