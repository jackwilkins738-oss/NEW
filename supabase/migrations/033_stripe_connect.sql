-- One Stripe Connect account per tenant - money from a paid invoice goes
-- straight to that business's own bank account via Stripe, not into a
-- shared platform account. Nullable: online payment stays hidden until a
-- tenant actually connects.
alter table tenants add column stripe_account_id text;
