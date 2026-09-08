-- Full quote-builder overhaul: itemised costs by category, markup, VAT,
-- quote number/expiry/deposit/terms/exclusions, and a public accept/decline
-- link. line_items now carry a `category` (materials/labour/subcontractors/
-- other) alongside description/amount, so a quote's cost breakdown can
-- later seed a project's budgeted costs - not built yet, but this is what
-- makes that possible without another reshape.
alter table quotes add column quote_number text;
alter table quotes add column customer_email text;
alter table quotes add column customer_phone text;
alter table quotes add column expires_at date;
alter table quotes add column deposit_pence bigint;
alter table quotes add column payment_terms text;
alter table quotes add column exclusions text;
alter table quotes add column terms text;
alter table quotes add column markup_percent numeric(6, 2) not null default 0;
alter table quotes add column vat_rate numeric(5, 2) not null default 20;
alter table quotes add column cost_subtotal_pence bigint not null default 0;
alter table quotes add column vat_amount_pence bigint not null default 0;

-- total_pence (added in 014) becomes the grand total shown to the customer:
-- (cost_subtotal_pence * (1 + markup_percent/100)) + vat_amount_pence,
-- computed and stored at save time - same "derive on write" pattern already
-- used for every other computed total in this schema.

-- Unguessable per-quote token for the public, no-login accept/decline page
-- (app/quote/[id]/[token]) - same publishable-token idea as tenants.site_key.
-- The public page reads via the service-role admin client and checks this
-- token itself; no RLS policy is added for public access, so quotes stay
-- unreachable through the anon REST API exactly as they are today.
alter table quotes add column accept_token uuid not null default gen_random_uuid();
alter table quotes add column sent_at timestamptz;
alter table quotes add column accepted_at timestamptz;
alter table quotes add column declined_at timestamptz;

create unique index quotes_accept_token_idx on quotes(accept_token);
