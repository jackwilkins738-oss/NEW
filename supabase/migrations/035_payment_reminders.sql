-- Tracks the last automated overdue-payment reminder sent to a customer,
-- so the daily cron (app/api/cron/payment-reminders) can re-remind on an
-- interval instead of emailing the same overdue invoice every single day.
alter table invoices add column last_reminder_sent_at timestamptz;
