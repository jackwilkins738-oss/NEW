-- Every member of a tenant currently has identical access - no way to give
-- a limited view to office staff or a site foreman without also handing
-- them bank details, VAT settings, and the Stripe connection. Two roles is
-- deliberately as simple as this gets: 'owner' (everything, unchanged from
-- today) and 'member' (everything except Settings). Defaulting every
-- existing row to 'owner' means nobody loses access when this ships -
-- Jack has to actively downgrade someone for the restriction to apply.
alter table memberships add column role text not null default 'owner' check (role in ('owner', 'member'));
