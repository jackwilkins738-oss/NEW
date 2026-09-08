-- Lets an invoice be raised straight off a contacted lead, before it's ever
-- gone through a quote or become a project - small jobs that don't need
-- the full pipeline. Purely a link for tracking/picking; unlike lead/quote
-- -> project conversion, this does NOT create a customer record - a lead
-- only gets a customer once it's actually won.
alter table invoices add column lead_id uuid references leads(id) on delete set null;
