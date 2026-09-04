-- Example tenant so the dashboard has something to show on first run.
-- Run after schema.sql. Replace the auth user id once you've created a login
-- for this business in Supabase Auth (Authentication -> Users -> Add user),
-- then insert their membership row (see bottom of this file).

insert into tenants (business_name, slug, domain)
values ('Ridgeview Lofts & Extensions', 'ridgeview', null)
returning id, site_key; -- note the returned site_key: it goes in that tenant's tracking snippet

insert into projects (tenant_id, ref, client_name, location, project_type, stage, value_pence, pm, target_date, status)
select id, 'LC-2026-041', 'Whitfield residence', 'Guildford', 'Hip-to-gable loft', 'On site - first fix', 5840000, 'Sam O.', '2026-11-14', 'on_track'
from tenants where slug = 'ridgeview';

insert into projects (tenant_id, ref, client_name, location, project_type, stage, value_pence, pm, target_date, status)
select id, 'RE-2026-038', 'Carrow family', 'Farnham', 'Rear extension', 'Building control', 4620000, 'Priya A.', '2026-11-28', 'on_track'
from tenants where slug = 'ridgeview';

insert into projects (tenant_id, ref, client_name, location, project_type, stage, value_pence, pm, target_date, status)
select id, 'LC-2026-039', 'Okafor residence', 'Woking', 'Dormer loft', 'Planning decision', 6190000, 'Sam O.', '2026-12-19', 'at_risk'
from tenants where slug = 'ridgeview';

insert into invoices (tenant_id, client_name, reference, amount_pence, due_date, status)
select id, 'Sinclair household', 'INV-3187', 1840000, current_date - interval '14 days', 'unpaid'
from tenants where slug = 'ridgeview';

insert into invoices (tenant_id, client_name, reference, amount_pence, due_date, status)
select id, 'Carrow family', 'INV-3201', 925000, current_date + interval '4 days', 'unpaid'
from tenants where slug = 'ridgeview';

insert into invoices (tenant_id, client_name, reference, amount_pence, due_date, status)
select id, 'Bevan household', 'INV-3199', 1200000, current_date + interval '21 days', 'unpaid'
from tenants where slug = 'ridgeview';

insert into invoices (tenant_id, client_name, reference, amount_pence, due_date, status)
select id, 'Whitfield residence', 'INV-3150', 2600000, current_date - interval '40 days', 'paid'
from tenants where slug = 'ridgeview';

-- After creating a login for the owner in Authentication -> Users, link them to the tenant:
-- insert into memberships (tenant_id, user_id)
-- select id, '<paste the auth user id here>' from tenants where slug = 'ridgeview';
