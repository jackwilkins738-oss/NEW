-- Leads only ever had name/phone/email/source/status/value - these round
-- out the record closer to what Jack's original spec asked for. Status
-- itself is free text (not a DB enum), so "survey_booked" is just a new
-- value the app now recognises, no schema change needed for that part.
alter table leads add column address text;
alter table leads add column job_type text;
alter table leads add column notes text;
