-- variations never got a tenant_id index (migration 018 only indexed
-- project_id) - the dashboard's "pending variations" query filters by
-- tenant_id directly, which was doing a full table scan without this.
create index if not exists variations_tenant_idx on variations(tenant_id, status);
