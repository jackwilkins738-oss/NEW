-- A dedicated completion timestamp, separate from the on_track/at_risk/
-- delayed/awaiting_decision status (that's risk tracking, this is
-- lifecycle) - marking a project complete is what triggers the automatic
-- review request below.
alter table projects add column completed_at timestamptz;

-- The tenant's own Google Business Profile review link (whatever Google
-- gives them - a short g.page/r/... link or a placeid-based
-- search.google.com/local/writereview?placeid=... URL, stored as-is rather
-- than reconstructed from a Place ID so it isn't tied to one specific
-- format Google might change).
alter table tenants add column google_review_url text;
