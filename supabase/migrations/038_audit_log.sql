-- Nothing currently records who changed a quote's price, who deleted a
-- lead, or who marked an invoice paid - for a tool handling real money and
-- legal documents (quotes, invoices), a simple "who did what, when" trail
-- is a standard expectation once more than one person touches it.
-- user_id is nullable: some logged actions are customer-initiated (accept/
-- decline a quote via the public token link), where there's no signed-in
-- user at all.
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  summary text not null,
  created_at timestamptz not null default now()
);

create index audit_log_tenant_idx on audit_log(tenant_id, created_at desc);

alter table audit_log enable row level security;

-- Read-only from the app's own session-scoped client (member can see their
-- own tenant's log); every write in the app goes through the service-role
-- admin client instead (see lib/auditLog.ts), so no insert policy exists -
-- the log itself can't be edited or added to by a compromised member
-- session, only appended to by server-side code that already trusts its
-- own inputs.
create policy "member can read own tenant's audit log" on audit_log
  for select using (
    exists (select 1 from memberships m where m.tenant_id = audit_log.tenant_id and m.user_id = auth.uid())
  );
