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
   (once you know it) their domain. Creating it hands back a **site key** —
   copy it, you'll need it for step 3.
2. **Point their domain at the dashboard** — add a DNS record at their
   registrar (a `CNAME` to your Vercel deployment, e.g.
   `dashboard.theirdomain.co.uk → cname.vercel-dns.com`), then add that exact
   domain in Vercel → Domains. SSL is issued automatically once DNS resolves.
   If you didn't have the domain yet in step 1, come back and update the
   tenant's `domain` once it's set (currently a Supabase table edit — a
   "rename domain" admin action is an easy future addition).
3. **Embed the tracking snippet** in their site, once, near `</body>`:
   ```html
   <script src="https://dashboard.yourbrand.com/track.js"
           data-tenant="<tenant id from step 1>"
           data-site-key="<site key from step 1>"
           defer></script>
   ```
4. **Mark their lead form** so submissions get captured — add
   `data-lead-form` to the `<form>` tag, and make sure its fields are named
   `name`, `email`, `phone`, `message` (whichever apply):
   ```html
   <form data-lead-form>
     <input name="name" />
     <input name="email" />
     <textarea name="message"></textarea>
     <button type="submit">Send</button>
   </form>
   ```
   Page views are captured automatically just by the script being present —
   no extra markup needed for that part.
5. **Go to `/admin` → "Invite a login"** — pick the business, enter their
   email, and it hands back a one-time link. Copy it and send it to them
   yourself (no email server needed) — clicking it lets them set their own
   password and signs them straight in.

## Security notes

- Row-level security (`supabase/schema.sql`) is what actually enforces
  tenant isolation — even a bug in this app's code can't leak one customer's
  data into another's session, because the database itself refuses the query.
- `site_key` is meant to be public — it's embedded in plain view in a
  `<script>` tag on the customer's own website, the same way a Stripe
  *publishable* key is public. It only grants the ability to insert leads/
  pageviews for that one tenant, never to read anything.
- Not yet handled (worth adding before this is customer-facing at scale):
  rate-limiting on the public insert endpoints, so the `/track.js` endpoint
  can't be spammed with junk leads. Fine to skip while customer count is
  small; add via Supabase Edge Functions or a WAF rule once it matters.

## What's built vs. what's next

Real and working: authentication, tenant isolation, live leads/pageviews/
projects/invoices data, per-project editing, a no-SQL `/admin` screen for
onboarding customers and inviting logins — all deployable today.

Still open: the **alerts panel** and **capacity meters** from the original
mockup need data the app doesn't capture yet (flagged issues, subcontractor
scheduling) — worth a separate pass once it's clear how you actually want to
run that side of it. `/admin` also doesn't yet let you edit a tenant's
domain after creation (a Supabase table edit for now) or remove a login.
