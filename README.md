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
3. In Supabase → Project Settings → API, copy the **Project URL** and
   **anon public key**.
4. Copy `.env.example` to `.env.local` and paste those two values in.
5. **Deploy to Vercel**: push this folder to a GitHub repo, import it in
   Vercel, and add the same two environment variables there.
6. In Vercel → your project → Settings → Domains, add a wildcard domain if
   you're using subdomains of your own brand (e.g. `*.yourbrand.com`), or
   you'll add each customer's own domain individually per the checklist below.

### Local development

This machine doesn't currently have Node.js installed, so `npm install` /
`npm run dev` won't run here yet — install Node 18+ (nodejs.org) to develop
locally. You don't strictly need to: pushing to GitHub and letting Vercel
build it works without ever running it on your own machine.

## Onboarding a new customer (~10–15 min)

1. **Create their tenant row** — in Supabase, either run SQL directly or (later)
   build a small internal admin form for this:
   ```sql
   insert into tenants (business_name, slug, domain)
   values ('Their Business Name', 'their-slug', 'dashboard.theirdomain.co.uk')
   returning id, site_key;
   ```
   Keep the returned `site_key` — it goes in their `track.js` embed.
2. **Create their login** — Supabase → Authentication → Users → Add user
   (or send them an invite email). Then link that login to their tenant:
   ```sql
   insert into memberships (tenant_id, user_id)
   values ('<tenant id from step 1>', '<their auth user id>');
   ```
3. **Point their domain at the dashboard** — add a DNS record at their
   registrar (a `CNAME` to your Vercel deployment, e.g.
   `dashboard.theirdomain.co.uk → cname.vercel-dns.com`), then add that exact
   domain in Vercel → Domains. SSL is issued automatically once DNS resolves.
4. **Embed the tracking snippet** in their site, once, near `</body>`:
   ```html
   <script src="https://dashboard.yourbrand.com/track.js"
           data-tenant="<tenant id from step 1>"
           data-site-key="<site_key from step 1>"
           defer></script>
   ```
5. **Mark their lead form** so submissions get captured — add
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

They can now sign in at their dashboard URL with the login from step 2.

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

This is a real, working v1: authentication, tenant isolation, live leads/
pageviews/projects data, deployable today. It does **not** yet replicate
every visual element of the original dashboard mockup (the charts, funnel,
alerts panel, capacity meters) — those are straightforward to port into
`app/dashboard/page.tsx` using the same design tokens (`app/globals.css`),
but were left out of this pass to get a real, live, multi-tenant system in
place first rather than a bigger pile of static UI.
