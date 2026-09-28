-- Automatic Google review requests (lib/reviewRequests.ts): once a job is
-- marked complete, the customer is emailed the business's Google review link
-- 2 days later, and reminded once 7 days after that - never a third time.
-- Off unless a business turns it on in Settings (tenants.auto_review_requests),
-- and only once it has saved its Google review link. The manual "Send request"
-- button counts as an ask too, so nobody is asked twice by accident.
alter table reviews add column if not exists ask_count int not null default 0 check (ask_count between 0 and 5);
alter table reviews add column if not exists last_asked_at timestamptz;
alter table tenants add column if not exists auto_review_requests boolean not null default false;
