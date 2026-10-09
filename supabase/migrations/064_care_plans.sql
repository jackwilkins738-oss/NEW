-- Care plans (lib/billing.ts): what each launched client pays monthly and
-- what's switched on for them. Care is the existing £39 dashboard fee;
-- Growth and Pro add the Local Growth work (reviews, Google posts, SEO pages).
-- Changed from /admin, which also changes their Stripe subscription.
alter table tenants add column if not exists plan text not null default 'care';
alter table tenants drop constraint if exists tenants_plan_check;
alter table tenants add constraint tenants_plan_check check (plan in ('care', 'growth', 'pro'));
