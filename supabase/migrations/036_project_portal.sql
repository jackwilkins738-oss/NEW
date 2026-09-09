-- A real per-project customer portal, one link instead of the separate
-- standalone quote/invoice pages a customer had before (each tied to one
-- document, no shared view across everything on their job). Same
-- publishable-token pattern as invoices.view_token / quotes.accept_token -
-- an unguessable uuid in the URL is what proves the visitor is the
-- intended recipient, no login system needed.
alter table projects add column portal_token uuid not null default gen_random_uuid();
create unique index projects_portal_token_idx on projects(portal_token);
