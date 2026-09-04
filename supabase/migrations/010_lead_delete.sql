-- Run in the Supabase SQL editor. Leads could be read and status-updated by
-- a tenant's own members, but never deleted (no policy allowed it) - there
-- was no way to remove a mistaken or spam entry short of the database
-- console. This adds that.

create policy "member can delete own leads" on leads
  for delete using (
    exists (select 1 from memberships m where m.tenant_id = leads.tenant_id and m.user_id = auth.uid())
  );
