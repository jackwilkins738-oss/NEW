-- Run in the Supabase SQL editor. Adds an ip column to leads so
-- /api/leads can rate-limit per submitter, not just per tenant (which
-- would otherwise punish every visitor on a tenant's site for one
-- abusive submitter).

alter table leads add column if not exists ip text;
create index if not exists leads_tenant_ip_idx on leads(tenant_id, ip, created_at desc);
