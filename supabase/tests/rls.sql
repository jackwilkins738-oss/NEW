-- Tenant isolation, proven against the real schema.
--
-- Load supabase/tests/supabase-shim.sql, supabase/schema.sql and every
-- migration into an empty Postgres, then run this file (scripts/test-rls.sh
-- does all of that, and so does the "rls" CI job). It seeds two businesses,
-- signs in as a member of the first, and for every table that belongs to a
-- business checks that the second business's rows can't be read, changed,
-- deleted, added to or moved into - and that the first business can still see
-- its own, so a policy that blocks everything can't pass by accident. Then
-- the same from a signed-out visitor, and the few things that are public on
-- purpose. Any failure stops the run with a list of what leaked.

\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists rls_test;
drop table if exists rls_test.fixture;
create table rls_test.fixture (tbl text, tenant text, row_data jsonb, settable text);
grant usage on schema rls_test to anon, authenticated;
grant select on rls_test.fixture to anon, authenticated;

-- ---------------------------------------------------------------- seed

create or replace function rls_test.seed(t uuid, u uuid, tag text) returns void language plpgsql as $$
declare
  p uuid; q uuid; o uuid; tm uuid;
begin
  insert into auth.users (id, email) values (u, tag || '@example.com');
  insert into tenants (id, business_name, slug) values (t, 'Business ' || tag, 'biz-' || tag);
  insert into memberships (tenant_id, user_id, role) values (t, u, 'owner');
  insert into projects (tenant_id, client_name) values (t, 'Client ' || tag) returning id into p;
  insert into quotes (tenant_id, client_name) values (t, 'Client ' || tag) returning id into q;
  insert into team_members (tenant_id, name) values (t, 'Fitter ' || tag) returning id into tm;
  insert into leads (tenant_id, site_key, name) select t, site_key, 'Lead ' || tag from tenants where id = t;
  insert into pageviews (tenant_id, site_key) select t, site_key from tenants where id = t;
  insert into invoices (tenant_id, client_name, amount_pence, due_date) values (t, 'Client ' || tag, 10000, current_date);
  insert into customers (tenant_id, name) values (t, 'Customer ' || tag);
  insert into communications (tenant_id, project_id, summary) values (t, p, 'Called ' || tag);
  insert into audit_log (tenant_id, action, entity_type, summary) values (t, 'test', 'test', 'Audit ' || tag);
  insert into change_requests (tenant_id, message) values (t, 'Change ' || tag);
  insert into onboarding (tenant_id, quote_id, token, client_name) values (t, q, encode(gen_random_bytes(24), 'hex'), 'Client ' || tag) returning id into o;
  insert into onboarding_files (onboarding_id, tenant_id, storage_path, filename, kind, size_bytes) values (o, t, t || '/f.pdf', 'f.pdf', 'logo', 10);
  insert into project_cost_items (tenant_id, project_id) values (t, p);
  insert into project_documents (tenant_id, storage_path, filename) values (t, t || '/d.pdf', 'd.pdf');
  insert into project_photos (tenant_id, storage_path) values (t, t || '/p.jpg');
  insert into project_team_members (project_id, team_member_id) values (p, tm);
  insert into prospects (tenant_id, slug, business_name) values (t, 'prospect-' || tag, 'Prospect ' || tag);
  insert into push_subscriptions (user_id, tenant_id, endpoint, p256dh, auth) values (u, t, 'https://push.example/' || tag, 'k', 'a');
  insert into quote_templates (tenant_id, name) values (t, 'Template ' || tag);
  insert into reviews (tenant_id, customer_name) values (t, 'Reviewer ' || tag); -- not published
  insert into service_reminders (tenant_id, project_id, label, due_on) values (t, p, 'Service ' || tag, current_date);
  insert into snags (tenant_id, project_id, description) values (t, p, 'Snag ' || tag);
  insert into suppliers (tenant_id, name) values (t, 'Supplier ' || tag);
  insert into trade_capacity (tenant_id, trade_name) values (t, 'Trade ' || tag);
  insert into variations (tenant_id, project_id, description) values (t, p, 'Variation ' || tag);
end $$;

select rls_test.seed('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'a');
select rls_test.seed('bbbbbbbb-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-0000000000b2', 'b');

-- The tables that belong to a business, and one row of each business's to
-- try to copy in later - taken now, while RLS doesn't apply.
do $$
declare r record;
begin
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id'
    where n.nspname = 'public' and c.relkind = 'r' and c.relname not in ('tenants')
    order by 1
  loop
    execute format(
      'insert into rls_test.fixture (tbl, tenant, row_data) select %L, t, to_jsonb(x) from (select %2$s.*, case when tenant_id = %3$L then ''a'' else ''b'' end t from %2$I where tenant_id in (%3$L, %4$L)) x',
      r.relname, r.relname, 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002');
    -- A column with a default that isn't a key: what the blind update sets.
    update rls_test.fixture set settable = (
      select a.attname from pg_attribute a join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where a.attrelid = r.relname::regclass and a.attnum > 0 and not a.attisdropped
        and a.attname not in ('id', 'tenant_id', 'site_key', 'token', 'accept_token', 'view_token', 'portal_token')
        and not exists (select 1 from pg_constraint k where k.conrelid = a.attrelid and k.contype in ('p', 'u', 'f') and a.attnum = any(k.conkey))
      order by (a.attname in ('created_at', 'updated_at')) desc, a.attnum limit 1)
    where tbl = r.relname;
  end loop;
end $$;

-- ---------------------------------------------------------------- checks

create or replace function rls_test.check_as(role_name text, uid uuid) returns text[] language plpgsql as $$
declare
  a constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  b constant uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  tname text; col text; n bigint; own bigint; fail text[] := '{}'; bad jsonb; cols text;
  -- Readable by anyone on purpose (published on the business's own site):
  -- project_photos feeds /gallery.js. Reviews are only public once
  -- published, and are seeded unpublished here, so they must NOT show.
  public_read constant text[] := array['project_photos'];
begin
  for tname, col in select f.tbl, max(f.settable) from rls_test.fixture f group by f.tbl order by 1 loop
    -- Each table in its own sandbox, undone at the end (the Z9999 below), so
    -- a delete here can't cascade into the next table's check.
    begin
      -- Read another business's rows
      execute format('select count(*) from %I where tenant_id = %L', tname, b) into n;
      if n > 0 and not tname = any(public_read) then fail := fail || format('%s: %s can READ business B (%s rows)', tname, role_name, n); end if;

      -- A signed-in member still sees their own (so the test means something)
      execute format('select count(*) from %I', tname) into own;
      if role_name = 'member of A' then
        execute format('select count(*) from %I where tenant_id = %L', tname, a) into n;
        if n = 0 then fail := fail || format('%s: member of A can''t see their OWN rows - policy too strict or test broken', tname); end if;
      end if;

      -- Change another business's rows
      begin
        execute format('update %I set tenant_id = tenant_id where tenant_id = %L', tname, b);
        get diagnostics n = row_count;
        if n > 0 then fail := fail || format('%s: %s can UPDATE business B (%s rows)', tname, role_name, n); end if;
      exception when insufficient_privilege then null;
      end;

      -- A blind update that references no column only has to pass the UPDATE
      -- policy, not SELECT, so it can reach rows a filtered one can't. More
      -- rows touched than this role can see = a leak.
      begin
        execute format('update %I set %I = default', tname, col);
        get diagnostics n = row_count;
        if n > own then fail := fail || format('%s: %s can UPDATE rows it can''t see (%s touched, %s visible)', tname, role_name, n, own); end if;
      exception when insufficient_privilege then null;
      end;

      -- Add a row to another business (a copy of one of B's, with a fresh id)
      select row_data into bad from rls_test.fixture f where f.tbl = tname and f.tenant = 'b' limit 1;
      if bad is not null then
        bad := (bad - 't' - 'settable') || jsonb_build_object('id', gen_random_uuid());
        select string_agg(quote_ident(k), ', ') into cols from jsonb_object_keys(bad) k;
        begin
          execute format('insert into %I (%s) select %s from jsonb_populate_record(null::%I, %L)', tname, cols, cols, tname, bad);
          -- Enquiries and page views are the public contact form and tracker:
          -- anyone holding a business's site key may add them (checked
          -- separately: the key has to be that business's own).
          if tname not in ('leads', 'pageviews') then
            fail := fail || format('%s: %s can INSERT into business B', tname, role_name);
          end if;
        exception when insufficient_privilege or unique_violation or foreign_key_violation or check_violation or not_null_violation then null;
        end;
      end if;

      -- Move one of their own rows into another business
      if role_name = 'member of A' then
        begin
          execute format('update %I set tenant_id = %L where tenant_id = %L', tname, b, a);
          get diagnostics n = row_count;
          if n > 0 then fail := fail || format('%s: member of A can MOVE rows into business B', tname); end if;
        exception when insufficient_privilege or foreign_key_violation then null;
        end;
      end if;

      -- Delete another business's rows, filtered and blind
      begin
        execute format('delete from %I where tenant_id = %L', tname, b);
        get diagnostics n = row_count;
        if n > 0 then fail := fail || format('%s: %s can DELETE business B (%s rows)', tname, role_name, n); end if;
      exception when insufficient_privilege or foreign_key_violation then null;
      end;
      begin
        execute format('delete from %I', tname);
        get diagnostics n = row_count;
        if n > own then fail := fail || format('%s: %s can DELETE rows it can''t see (%s deleted, %s visible)', tname, role_name, n, own); end if;
      exception when insufficient_privilege or foreign_key_violation then null;
      end;

      raise exception using errcode = 'Z9999';
    exception when sqlstate 'Z9999' then null;
    end;
  end loop;
  return fail;
end $$;

grant usage on schema rls_test to anon, authenticated;
grant execute on all functions in schema rls_test to anon, authenticated;

-- Site keys, looked up now (visitors can't read them later), and a way to
-- try an insert and learn whether it went in.
create table rls_test.keys as select case when id = 'aaaaaaaa-0000-0000-0000-000000000001' then 'a' else 'b' end tenant, site_key from tenants;
grant select on rls_test.keys to anon, authenticated;
create or replace function rls_test.try_insert(stmt text) returns boolean language plpgsql as $$
begin
  execute stmt;
  return true;
exception when insufficient_privilege or check_violation or foreign_key_violation then
  return false;
end $$;
grant execute on function rls_test.try_insert(text) to anon, authenticated;

create or replace function rls_test.fail(report text) returns void language plpgsql as $$
begin
  raise exception E'Tenant isolation FAILED:\n%', report;
end $$;

-- Each pass runs in a transaction that is rolled back, so every pass starts
-- from the same data; its findings come out through a psql variable.

-- 1. Signed in as a member of business A.
begin;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-0000000000a1', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select coalesce(array_to_string(rls_test.check_as('member of A', 'aaaaaaaa-0000-0000-0000-0000000000a1'), E'\n'), '') as member_failures \gset
rollback;

-- 2. A signed-out visitor (the anon key every client site carries).
begin;
set local role anon;
select coalesce(array_to_string(rls_test.check_as('visitor', null), E'\n'), '') as visitor_failures \gset
rollback;

-- 3. What is public on purpose really is - and only that much.
begin;
update reviews set published = true, status = 'received' where tenant_id = 'bbbbbbbb-0000-0000-0000-000000000002';
set local role anon;
select concat_ws(E'\n',
  case when (select count(*) from reviews where tenant_id = 'bbbbbbbb-0000-0000-0000-000000000002') = 0
       then 'reviews: a published review is not readable by visitors (the website widget would be empty)' end,
  case when (select count(*) from project_photos where tenant_id = 'bbbbbbbb-0000-0000-0000-000000000002') = 0
       then 'project_photos: not readable by visitors (the gallery would be empty)' end
) as public_failures \gset
rollback;

-- The public form and tracker only accept a business's own site key.
begin;
set local role anon;
select concat_ws(E'\n',
  case when rls_test.try_insert('insert into leads (tenant_id, site_key, name) select ''bbbbbbbb-0000-0000-0000-000000000002'', site_key, ''x'' from rls_test.keys where tenant = ''a''')
       then 'leads: accepts an enquiry for business B made with business A''s site key' end,
  case when rls_test.try_insert('insert into pageviews (tenant_id, site_key) select ''bbbbbbbb-0000-0000-0000-000000000002'', site_key from rls_test.keys where tenant = ''a''')
       then 'pageviews: accepts a page view for business B made with business A''s site key' end,
  case when not rls_test.try_insert('insert into leads (tenant_id, site_key, name) select ''bbbbbbbb-0000-0000-0000-000000000002'', site_key, ''x'' from rls_test.keys where tenant = ''b''')
       then 'leads: refuses a genuine enquiry made with the business''s own site key (the contact form would be broken)' end
) as key_failures \gset
rollback;

-- A visitor can't read a business's private columns through the directory.
begin;
set local role anon;
select case when has_column_privilege('anon', 'tenants', 'bank_details', 'select')
            or has_column_privilege('anon', 'tenants', 'stripe_account_id', 'select')
       then 'tenants: visitors can read bank details / Stripe account' else '' end as column_failures \gset
rollback;

\echo
\echo 'member of A vs business B:' :member_failures
\echo 'signed-out visitor:' :visitor_failures
\echo 'public on purpose:' :public_failures
\echo 'site keys:' :key_failures
\echo 'private columns:' :column_failures

select rls_test.fail(concat_ws(E'\n', nullif(:'member_failures', ''), nullif(:'visitor_failures', ''),
                               nullif(:'public_failures', ''), nullif(:'key_failures', ''), nullif(:'column_failures', '')))
where concat(:'member_failures', :'visitor_failures', :'public_failures', :'key_failures', :'column_failures') <> '';

\echo 'Tenant isolation: every table checked, nothing leaked.'
