-- Automatic quote chasers (lib/quoteChasers.ts): a sent quote that hasn't
-- been accepted or declined gets a short, polite follow-up email to the
-- customer after 3 days, and one more 4 days after that - never a third.
-- Off unless a business turns it on (tenants.quote_chasers), so no existing
-- customer's clients start getting emails they didn't expect. Scalar
-- Digital's own dashboard has it on: its quotes go to outreach prospects.
alter table quotes add column if not exists chase_count int not null default 0 check (chase_count between 0 and 5);
alter table quotes add column if not exists last_chased_at timestamptz;
alter table tenants add column if not exists quote_chasers boolean not null default false;

update tenants set quote_chasers = true where id = 'abdc6408-1fd5-4fb6-9c4c-53600b571a6d';
