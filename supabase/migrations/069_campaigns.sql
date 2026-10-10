-- Campaigns (Growth plan and up, lib/campaigns.ts): a short seasonal email from a
-- business to its past customers - "gutters before winter" - written with
-- AI, approved and sent from /campaigns. Past customers only (a customer with
-- at least one job), never more than one campaign a month each, and every
-- email carries an unsubscribe link that works without signing in.

alter table customers add column if not exists unsubscribed_at timestamptz;
alter table customers add column if not exists unsubscribe_token uuid not null default gen_random_uuid();
create unique index if not exists customers_unsubscribe_token_idx on customers(unsubscribe_token);

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  subject text not null check (char_length(subject) between 1 and 120),
  body text not null check (char_length(body) between 1 and 4000),
  status text not null default 'sent' check (status in ('sending', 'sent')),
  sent_count int not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists campaigns_tenant_idx on campaigns(tenant_id, created_at desc);

-- One row per customer emailed, so a resend never doubles up and the monthly limit can be checked.
create table if not exists campaign_sends (
  campaign_id uuid not null references campaigns(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (campaign_id, customer_id)
);
create index if not exists campaign_sends_customer_idx on campaign_sends(customer_id, sent_at desc);

alter table campaigns enable row level security;
alter table campaign_sends enable row level security;

-- Members read their own; sending is done by the server (it checks membership and the plan).
drop policy if exists "member can read own campaigns" on campaigns;
create policy "member can read own campaigns" on campaigns
  for select using (exists (select 1 from memberships m where m.tenant_id = campaigns.tenant_id and m.user_id = auth.uid()));
