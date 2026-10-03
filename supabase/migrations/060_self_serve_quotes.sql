-- 060: the quote a prospect gets when they press "See my quote" on their own preview page.
--
-- The owner's panel publishes, per package, exactly the quote it would send itself (line items,
-- price, deposit, VAT, payment terms, exclusions, terms of business, optional extras) - so the
-- prices and terms live in one place (the panel) and are never re-typed on the website.
-- POST /api/prospects/[slug]/start makes the prospect's quote from it.
--
-- Service-only: no policies, so no signed-in user or visitor can read or change it - only the
-- service role behind the panel's and website's server-to-server calls.

create table if not exists self_serve_quotes (
  tenant_id uuid not null references tenants(id) on delete cascade,
  package text not null check (package in ('build', 'landing')),
  body jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, package)
);

alter table self_serve_quotes enable row level security;
