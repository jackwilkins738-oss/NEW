-- Job profitability. Five cost categories per project (materials, labour,
-- subcontractors, plant, other), matching how Jack actually breaks a job
-- down - actual cost, gross profit and margin are all computed from these
-- wherever they're read, same pattern as "overdue" on invoices, so there's
-- nothing to keep in sync with a cron job.
alter table projects add column materials_cost_pence bigint not null default 0;
alter table projects add column labour_cost_pence bigint not null default 0;
alter table projects add column subcontractor_cost_pence bigint not null default 0;
alter table projects add column plant_cost_pence bigint not null default 0;
alter table projects add column other_cost_pence bigint not null default 0;
