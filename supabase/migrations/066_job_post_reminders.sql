-- Job posts (065): one reminder to the client when a draft has waited 3 days
-- for their approval (lib/jobPosts.ts, from the daily cron).
alter table job_posts add column if not exists reminded_at timestamptz;
