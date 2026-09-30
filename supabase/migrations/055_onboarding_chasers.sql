-- Onboarding chasers (lib/onboardingChasers.ts): a client who accepted their
-- quote but hasn't sent their website details gets at most two friendly
-- reminders, and the business is told after the second - builds stall on
-- waiting for the client far more than on anything else.
alter table onboarding add column if not exists chase_count int not null default 0;
alter table onboarding add column if not exists last_chased_at timestamptz;
