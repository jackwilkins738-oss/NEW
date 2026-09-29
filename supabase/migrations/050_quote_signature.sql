-- A signed acceptance (app/quote/actions.ts): the customer types their name
-- and ticks that they accept the quote and its terms. The name, time, IP
-- address and browser are kept with the quote as the record of the
-- agreement, and the customer is emailed a copy.
alter table quotes add column if not exists accepted_name text check (accepted_name is null or char_length(accepted_name) <= 100);
alter table quotes add column if not exists accepted_ip text check (accepted_ip is null or char_length(accepted_ip) <= 64);
alter table quotes add column if not exists accepted_user_agent text check (accepted_user_agent is null or char_length(accepted_user_agent) <= 300);
