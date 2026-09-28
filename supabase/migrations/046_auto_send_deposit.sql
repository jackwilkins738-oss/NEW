-- When a customer accepts a quote online, the job is created and the
-- business is emailed straight away (app/quote/actions.ts). This switch
-- decides whether the deposit invoice is also emailed to the customer
-- automatically. Off unless a business turns it on in Settings - by default
-- the alert just says what deposit to invoice, one tap away on the job.
alter table tenants add column if not exists auto_send_deposit boolean not null default false;
