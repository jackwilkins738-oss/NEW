-- Run this in the Supabase SQL editor on any project that already ran
-- schema.sql before per-tenant brand color existed.

alter table tenants add column if not exists brand_theme text not null default 'rust';
