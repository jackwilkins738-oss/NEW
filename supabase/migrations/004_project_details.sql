-- Run this in the Supabase SQL editor on any project that already ran
-- schema.sql before these project detail fields existed. (New projects get
-- this straight from the updated schema.sql - no need to run this file too.)
--
-- No new RLS policy needed: "member can manage own projects" (schema.sql)
-- already covers update on this table for any column, including these.

alter table projects add column if not exists start_date date;
alter table projects add column if not exists next_visit_at timestamptz;
alter table projects add column if not exists payment_type text;
alter table projects add column if not exists notes text;
