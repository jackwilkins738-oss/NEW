-- The daily helpers (lib/visitReminders.ts, lib/morningBrief.ts,
-- lib/enquiryNudge.ts).
--   visit_reminders: email customers the day before a booked visit. Off
--     unless a business turns it on - it writes to their customers.
--   morning_brief: the business's own 7am summary. On by default, off in
--     Settings.
--   projects.visit_reminded_for: the visit time a reminder went out for, so a
--     rebooked visit gets a fresh reminder and an unchanged one never gets two.
--   leads.nudged_at: when the business was nudged about an unanswered
--     enquiry, so it happens once.
alter table tenants add column if not exists visit_reminders boolean not null default false;
alter table tenants add column if not exists morning_brief boolean not null default true;
alter table projects add column if not exists visit_reminded_for timestamptz;
alter table leads add column if not exists nudged_at timestamptz;
