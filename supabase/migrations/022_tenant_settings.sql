-- Defaults so a quote doesn't start from a blank VAT rate and empty terms
-- every single time - the owner can still override per-quote, this just
-- sets what a new one starts with.
alter table tenants add column default_vat_rate numeric(5, 2) not null default 20;
alter table tenants add column default_quote_terms text;
alter table tenants add column default_payment_terms text;
