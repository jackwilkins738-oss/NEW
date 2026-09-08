-- The tenant's own contact email - used as the reply-to on emails sent on
-- their behalf (quotes, eventually invoices) so a customer's reply lands in
-- the tenant's inbox rather than Scalar's, even though the email still
-- sends from Scalar's own verified domain. Nullable: falls back to no
-- reply-to override (replies go to the From address) until a tenant sets
-- one.
alter table tenants add column contact_email text;
