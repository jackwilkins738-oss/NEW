-- The "anyone can read tenant directory" policy (schema.sql) was written
-- when tenants only held business_name/slug/domain/site_key - genuinely not
-- secret, and needed unauthenticated (site_key validation on public lead/
-- pageview inserts, the login page before anyone's signed in). Since then,
-- migrations 021/022/029/032/033 added contact_email, VAT rate/number,
-- payment terms, a Google review link, company address, bank details, an
-- invoice/quote numbering sequence and the Stripe Connect account id to the
-- SAME table - and row-level security is row-level, not column-level, so
-- "using (true)" made every one of those columns readable by anyone with
-- the public anon key too (which ships in plain text in every tenant's own
-- track.js snippet). That's a live data leak: bank details, VAT numbers,
-- Stripe account ids and contact emails for every tenant, plus every
-- tenant's site_key and id (which is itself the credential the Stripe
-- Connect OAuth state-forging fix assumes an attacker can't just look up).
--
-- The row policy stays "using (true)" - the public site_key check in the
-- leads/pageviews insert policies runs as the anon role and needs to read
-- SOME row in tenants to work at all. What changes is which COLUMNS anon
-- and authenticated can see on ANY row, via Postgres column-level grants
-- (a separate mechanism from RLS - RLS filters rows, this filters columns,
-- and both apply together). Only the columns actually needed for public
-- identity/branding and the site_key check are left readable; everything
-- added since migration 021 requires the admin client instead (RLS's own
-- update/delete policies on tenants were already platform-admin-only - this
-- closes the matching gap on select).
--
-- lib/tenant.ts's getCurrentTenant() already switched to the admin client
-- for this reason (it needs the full row for legitimate authenticated
-- pages, and runs before membership is checked). A few other call sites
-- that read contact_email through the session-scoped client were moved to
-- the admin client too - see app/dashboard/actions.ts (sendInvoice,
-- sendQuote, sendReviewRequestEmail).
revoke select on tenants from anon, authenticated;

grant select (
  id,
  business_name,
  slug,
  domain,
  site_key,
  brand_theme,
  logo_url,
  google_review_url,
  created_at
) on tenants to anon, authenticated;
