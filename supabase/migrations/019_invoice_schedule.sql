-- Payment schedule support: a milestone label (Deposit / Stage 1 / Final)
-- so several invoices against the same project read as a schedule rather
-- than a flat list, and paid_pence so a part-payment can be recorded
-- without the invoice being fully "paid" yet. status gains 'draft' and
-- 'part_paid' alongside the existing 'unpaid'/'paid' - overdue/due-soon
-- stay computed from due_date wherever they're shown, same as before, not
-- stored as their own status.
alter table invoices add column milestone text;
alter table invoices add column paid_pence bigint not null default 0;
