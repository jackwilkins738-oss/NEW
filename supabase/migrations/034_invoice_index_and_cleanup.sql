-- Every other project-scoped table (snags, documents, communications,
-- cost items, variations, reviews) already has an index on project_id -
-- invoices was the one left out, despite the project detail page
-- querying invoices filtered by project_id directly.
create index if not exists invoices_project_idx on invoices(project_id);

-- Dead columns from migration 015 - superseded by project_cost_items
-- (migration 017) the same day, and confirmed nothing in the app has read
-- or written them since. Safe to drop; nothing else references them.
alter table projects drop column if exists materials_cost_pence;
alter table projects drop column if exists labour_cost_pence;
alter table projects drop column if exists subcontractor_cost_pence;
alter table projects drop column if exists plant_cost_pence;
alter table projects drop column if exists other_cost_pence;
