-- Uptime and SSL monitoring of Scalar Digital's clients' websites
-- (lib/siteMonitor.ts), checked hourly. website_url is set on /admin. The
-- admin is emailed when a site goes down (two failed checks in a row, so a
-- blip isn't an alarm), when it comes back, and when its certificate is
-- about to expire.
alter table tenants add column if not exists website_url text check (website_url is null or website_url ~ '^https://[a-z0-9.-]+\.[a-z]{2,}(/.*)?$');
alter table tenants add column if not exists site_status text check (site_status is null or site_status in ('up', 'down'));
alter table tenants add column if not exists site_fail_count int not null default 0;
alter table tenants add column if not exists site_down_since timestamptz;
alter table tenants add column if not exists site_cert_warned_at timestamptz;
