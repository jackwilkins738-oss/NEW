-- Run this in the Supabase SQL editor. Lets a platform admin edit a
-- tenant's domain from /admin after creation (previously a Supabase table
-- edit only).

create policy "platform admin can update tenants" on tenants
  for update using (
    exists (select 1 from platform_admins pa where pa.user_id = auth.uid())
  ) with check (
    exists (select 1 from platform_admins pa where pa.user_id = auth.uid())
  );
