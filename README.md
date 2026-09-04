# Loft Dashboard

Multi-tenant operations dashboard. One codebase, one database — every customer
gets their own login, their own domain, and can never see another customer's
data (enforced by database row-level security, not just app logic).

## How it fits together

- **Supabase** — the database, and the login accounts, in one place.
- **This Next.js app** — deployed once (e.g. to Vercel). It works out which
  customer a request is for by looking at the domain it arrived on
  (`lib/tenant.ts`), then only ever queries that customer's rows.
- **`/track.js`** — a script you paste into each customer's own website. It
  reports page views automatically, and leads whenever a form marked
  `data-lead-form` is submitted.

## One-time setup

1. **Create a Supabase project** at supabase.com (free tier is fine).
2. In the Supabase SQL editor, run `supabase/schema.sql`, then (optional, for
   a demo tenant) `supabase/seed.sql`.
3. In Supabase → Project Settings → API, copy the **Project URL**, the
   **anon public key**, and the **service_role key** (the last one is
   secret — it powers `/admin`, see below).
4. Copy `.env.example` to `.env.local` and paste those three values in.
5. **Deploy to Vercel**: push this folder to a GitHub repo, import it in
   Vercel, and add the same three environment variables there.
6. In Vercel → your project → Settings → Domains, add a wildcard domain if
   you're using subdomains of your own brand (e.g. `*.yourbrand.com`), or
   you'll add each customer's own domain individually per the checklist below.
7. **Bootstrap yourself as a platform admin** — in the Supabase SQL editor:
   ```sql
   insert into platform_admins (user_id) values ('<your auth user id>');
   ```
   Find your user id in Authentication → Users. This is a one-time,
   SQL-only step (there's no UI for it — you'd need to already be an admin
   to make yourself one through the app). Everything after this is done
   from `/admin`, no SQL required.

### Local development

This machine doesn't currently have Node.js installed, so `npm install` /
`npm run dev` won't run here yet — install Node 18+ (nodejs.org) to develop
locally. You don't strictly need to: pushing to GitHub and letting Vercel
build it works without ever running it on your own machine.

## Onboarding a new customer (~10–15 min)

All done from `/admin` (only your bootstrapped login can reach that page) —
no SQL needed for any of this:

1. **Go to `/admin` → "Add a new customer"** — business name, a slug, and
   (once you know it) their domain. Creating it hands back the exact
   `<script>` tag to paste onto their site, with their id/site key already
   filled in — click Copy, no manual assembly needed. Existing customers
   have the same snippet (plus the contact-form markup) behind a "Get
   website snippet" link on their card in the customer list.
2. **Domain** — two options:
   - *Fast path*: leave the domain field blank. `*.scalardigital.co.uk` is
     wildcarded, so `<slug>.scalardigital.co.uk` works immediately with no
     DNS/Vercel step at all.
   - *Their own domain*: add a DNS record at their registrar (a `CNAME` to
     your Vercel deployment, e.g. `dashboard.theirdomain.co.uk →
     cname.vercel-dns.com`), then add that exact domain in Vercel →
     Domains. SSL is issued automatically once DNS resolves. Set it any
     time from that customer's card on `/admin`, even after creation.
3. **Add their redirect URL in Supabase** — Authentication → URL
   Configuration → Redirect URLs → add `https://<their domain or
   slug.scalardigital.co.uk>/**`. This is a genuine per-customer step, not
   a one-time thing: the `*.scalardigital.co.uk` wildcard does **not**
   cover Supabase's own redirect matching (confirmed the hard way) - their
   invite and password-reset links won't work without this exact entry.
   The success box after creating a customer (and the "Get website
   snippet" toggle on existing ones) shows this URL ready to copy.
4. **Paste the tracking snippet** onto their site, once, near `</body>`.
5. **Mark their lead form** so submissions get captured — the snippet
   behind "Get website snippet" shows this too: add `data-lead-form` to the
   `<form>` tag, with fields named `name`, `email`, `phone`, `message`
   (whichever apply). Page views are captured automatically just by the
   script being present — no extra markup needed for that part.
6. **Go to `/admin` → "Invite a login"** — pick the business, enter their
   email, and it hands back a one-time link. Copy it and send it to them
   yourself (no email server needed) — clicking it lets them set their own
   password and signs them straight in.

## Optional: Google Calendar sync

Lets a customer connect their own Google Calendar from their dashboard -
their existing day-to-day events show up alongside their jobs, and each
job's next site visit gets pushed as a real event on their calendar
(updated in place if the date changes, removed if the job is deleted).
Skip this section entirely if you don't need it yet; the app works the
same without it, the "Connect Google Calendar" button just won't appear
functional.

1. **console.cloud.google.com** → new project → **APIs & Services** →
   enable the **Google Calendar API**.
2. **OAuth consent screen** → External. It'll ask for a privacy policy and
   terms URL - use the ones already live at `/privacy` and `/terms`.
3. Add the `https://www.googleapis.com/auth/calendar.events` scope. This is
   a "sensitive" scope, but the app can stay in **Testing** publishing
   status (no Google review needed) as long as every real customer using it
   is added as a test user by email in the console - up to 100. Only worth
   going through Google's full verification once you're past that.
4. **Credentials** → **Create OAuth client ID** → Web application. Add this
   exact redirect URI (it's fixed - the flow always comes back here
   regardless of which tenant's domain started it):
   `https://admin.scalardigital.co.uk/api/calendar/google/callback`
5. Copy the Client ID and secret into `GOOGLE_CLIENT_ID` /
   `GOOGLE_CLIENT_SECRET` in Vercel's env vars.
6. Run `supabase/migrations/011_calendar_connections.sql` in the Supabase
   SQL editor (adds the token-storage table and one column on `projects`).

## Security notes

- Row-level security (`supabase/schema.sql`) is what actually enforces
  tenant isolation — even a bug in this app's code can't leak one customer's
  data into another's session, because the database itself refuses the query.
- `site_key` is meant to be public — it's embedded in plain view in a
  `<script>` tag on the customer's own website, the same way a Stripe
  *publishable* key is public. It only grants the ability to insert leads/
  pageviews for that one tenant, never to read anything.
- `/api/leads` rate-limits by IP: max 5 lead submissions per tenant per IP
  every 10 minutes, checked against the `leads` table itself (no Redis/
  external service needed). Over the limit gets the same vague 404 as an
  invalid `site_key`, rather than a distinguishable "rate limited" response.
  Pageviews aren't rate-limited (they still post straight to Supabase, not
  through this app - see "How it fits together" above) - lower value as a
  spam target and much higher volume, so not worth the added complexity yet.

## What's built vs. what's next

Real and working: authentication, tenant isolation, live leads/pageviews/
projects/invoices data (with self-service create/edit/delete throughout,
including leads), a monthly progress view, password reset, error monitoring
(Sentry), privacy/terms pages, an alerts panel (unfollowed leads, overdue
invoices, projects past their target date, upcoming site visits), trade
capacity meters, optional Google Calendar sync, and a no-SQL `/admin` screen
(create customers, edit their domain/brand colour, generate invite links,
remove a login, copy their ready-made tracking snippet) — all deployable
today.

Still open: nothing blocking — the natural next additions are things that
need real customer usage to justify (Outlook calendar sync alongside
Google, syncing `start_date`/`target_date` onto the calendar too, an
in-app "Getting started" guide for handover).
