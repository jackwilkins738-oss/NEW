-- Google Business Profile (lib/googleBusiness.ts), once Scalar's API access is
-- approved: Scalar's one Google account, added as a manager on each Growth
-- client's profile, posts their approved job posts and their review replies.

-- The one connection (Scalar's Google account). OAuth tokens: no policies,
-- server only - same as calendar_connections.
create table if not exists google_business_connection (
  id text primary key default 'scalar' check (id = 'scalar'),
  email text,
  access_token text not null,
  refresh_token text not null,
  token_expires_at timestamptz not null,
  connected_at timestamptz not null default now()
);
alter table google_business_connection enable row level security;

-- Which Google profile is each client's: "accounts/<id>/locations/<id>", linked in /admin.
alter table tenants add column if not exists gbp_location text;

-- Job posts (065) that went to Google by themselves.
alter table job_posts add column if not exists google_post_name text;
alter table job_posts add column if not exists google_posted_at timestamptz;
alter table job_posts add column if not exists google_error text;

-- Each client's Google reviews, fetched daily, with the reply once posted.
create table if not exists google_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  review_name text not null unique,
  reviewer text,
  star_rating int check (star_rating between 1 and 5),
  comment text,
  reviewed_at timestamptz,
  reply text,
  replied_at timestamptz,
  fetched_at timestamptz not null default now()
);
create index if not exists google_reviews_tenant_idx on google_reviews(tenant_id, reviewed_at desc);
alter table google_reviews enable row level security;

-- Members read their own; replies go through the server (which checks membership and posts to Google).
drop policy if exists "member can read own google reviews" on google_reviews;
create policy "member can read own google reviews" on google_reviews
  for select using (exists (select 1 from memberships m where m.tenant_id = google_reviews.tenant_id and m.user_id = auth.uid()));
