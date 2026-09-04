-- Loft Dashboard: multi-tenant schema
-- Run this in the Supabase SQL editor once, on a fresh project.

create extension if not exists "pgcrypto";

-- One row per customer business.
create table tenants (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  slug text not null unique,          -- used for local/dev access, e.g. ridgeview.localhost:3000
  domain text unique,                 -- the live subdomain once DNS is attached, e.g. dashboard.ridgeviewlofts.co.uk
  site_key uuid not null default gen_random_uuid(), -- public token embedded in that tenant's website snippet
  created_at timestamptz not null default now()
);

-- Links a Supabase auth user (their login) to the tenant(s) they can see.
create table memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

-- Leads captured from a tenant's website contact/quote form.
create table leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  site_key uuid not null,             -- must match tenants.site_key at insert time (see policy below)
  name text,
  email text,
  phone text,
  message text,
  source text,                        -- e.g. "google_ads", "referral", "organic"
  status text not null default 'new', -- new | contacted | quoted | won | lost
  status_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Page-view pings from a tenant's website.
create table pageviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  site_key uuid not null,
  path text,
  referrer text,
  created_at timestamptz not null default now()
);

-- Job/project tracking, entered by the business owner (not captured from the website).
create table projects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  ref text,
  client_name text not null,
  location text,
  project_type text,
  stage text,
  value_pence bigint,
  pm text,
  start_date date,
  target_date date,
  next_visit_at timestamptz,          -- next scheduled site visit/appointment, date + time
  payment_type text,                  -- e.g. "Fixed price", "Staged payments", "Deposit + balance", "Day rate"
  notes text,                         -- free-form project details
  status text default 'on_track',     -- on_track | at_risk | delayed | awaiting_decision
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Invoices raised against a job. "Overdue" / "due soon" aren't stored -
-- they're computed from due_date vs today wherever this is read, so there's
-- nothing to keep in sync with a cron job.
create table invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  client_name text not null,
  reference text,
  amount_pence bigint not null,
  due_date date not null,
  status text not null default 'unpaid', -- unpaid | paid
  created_at timestamptz not null default now()
);

-- Gates the /admin screen to specific people (you), not any signed-in
-- member of any tenant. No app UI writes to this table on purpose - it's a
-- one-time SQL bootstrap step (see the bottom of this file) to avoid a
-- chicken-and-egg problem (you'd need to already be an admin to make
-- yourself one through the app).
create table platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index leads_tenant_idx on leads(tenant_id, created_at desc);
create index invoices_tenant_idx on invoices(tenant_id, due_date asc);
create index pageviews_tenant_idx on pageviews(tenant_id, created_at desc);
create index projects_tenant_idx on projects(tenant_id, created_at desc);

-- ---------- Row Level Security ----------
alter table tenants enable row level security;
alter table memberships enable row level security;
alter table leads enable row level security;
alter table pageviews enable row level security;
alter table projects enable row level security;
alter table invoices enable row level security;
alter table platform_admins enable row level security;

create policy "self can read own admin row" on platform_admins
  for select using (user_id = auth.uid());

create policy "platform admin can create tenants" on tenants
  for insert with check (
    exists (select 1 from platform_admins pa where pa.user_id = auth.uid())
  );

create policy "platform admin can create memberships" on memberships
  for insert with check (
    exists (select 1 from platform_admins pa where pa.user_id = auth.uid())
  );

-- Tenant identity (business name, slug, domain, site_key) is not secret - the
-- login page needs to read it before anyone's signed in (to show "sign in to
-- <business>"), and the public insert policies below need it to validate a
-- site_key. site_key is a publishable token by design (it ships in a public
-- <script> tag on the tenant's own website), same idea as a Stripe publishable key.
create policy "anyone can read tenant directory" on tenants
  for select using (true);

create policy "member can read own memberships" on memberships
  for select using (user_id = auth.uid());

-- Dashboard reads: only members of that tenant.
create policy "member can read own leads" on leads
  for select using (
    exists (select 1 from memberships m where m.tenant_id = leads.tenant_id and m.user_id = auth.uid())
  );

create policy "member can read own pageviews" on pageviews
  for select using (
    exists (select 1 from memberships m where m.tenant_id = pageviews.tenant_id and m.user_id = auth.uid())
  );

create policy "member can update own leads" on leads
  for update using (
    exists (select 1 from memberships m where m.tenant_id = leads.tenant_id and m.user_id = auth.uid())
  ) with check (
    exists (select 1 from memberships m where m.tenant_id = leads.tenant_id and m.user_id = auth.uid())
  );

create policy "member can manage own projects" on projects
  for all using (
    exists (select 1 from memberships m where m.tenant_id = projects.tenant_id and m.user_id = auth.uid())
  ) with check (
    exists (select 1 from memberships m where m.tenant_id = projects.tenant_id and m.user_id = auth.uid())
  );

create policy "member can manage own invoices" on invoices
  for all using (
    exists (select 1 from memberships m where m.tenant_id = invoices.tenant_id and m.user_id = auth.uid())
  ) with check (
    exists (select 1 from memberships m where m.tenant_id = invoices.tenant_id and m.user_id = auth.uid())
  );

-- Public inserts: anyone (an unauthenticated visitor on the customer's website) can log a lead or
-- pageview, but only if the site_key they send matches the tenant they claim — this is what stops
-- one tenant's snippet being used to write into another tenant's data.
create policy "public can insert leads with a valid site key" on leads
  for insert with check (
    exists (select 1 from tenants t where t.id = leads.tenant_id and t.site_key = leads.site_key)
  );

create policy "public can insert pageviews with a valid site key" on pageviews
  for insert with check (
    exists (select 1 from tenants t where t.id = pageviews.tenant_id and t.site_key = pageviews.site_key)
  );

-- Bootstrap step (there's no UI for this - it would be a chicken-and-egg
-- problem): make your own existing login a platform admin, so /admin lets
-- you in. Find your user id in Authentication -> Users, then:
--
-- insert into platform_admins (user_id) values ('<your auth user id>');
