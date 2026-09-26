-- A basic, automated teardown of each prospect's current website, shown on
-- their private preview page ("What we found on smithroofing.co.uk").
--
-- Stored as structured check results, not prose: true = fine, false = a
-- problem, absent = couldn't be checked (never guessed). The wording lives
-- in the website's code (lib/teardown.ts), so it can be improved without
-- re-running any checks. Only facts from Google's own PageSpeed test and the
-- prospect's public homepage go in here - see scripts/push_prospects.py.
--
-- Written only by /api/prospects/import (service role). teardown_at is when
-- the checks ran, shown on the page as "Checked 26 September 2026".
alter table prospects add column if not exists teardown jsonb
  check (teardown is null or (jsonb_typeof(teardown) = 'object' and pg_column_size(teardown) < 8192));
alter table prospects add column if not exists teardown_at timestamptz;
