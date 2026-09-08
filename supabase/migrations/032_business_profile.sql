-- Rounds out Settings: company address, VAT number (distinct from the VAT
-- rate already added), bank details for invoices, a logo, and sequential
-- quote/invoice numbering (was random Q-YYYYMM-XXXX before - a real
-- business wants Q-0001, Q-0002 in order).
alter table tenants add column company_address text;
alter table tenants add column vat_number text;
alter table tenants add column bank_details text;
alter table tenants add column logo_url text;
alter table tenants add column quote_number_prefix text not null default 'Q';
alter table tenants add column invoice_number_prefix text not null default 'INV';
alter table tenants add column next_quote_number int not null default 1;
alter table tenants add column next_invoice_number int not null default 1;

-- Parallels quotes.quote_number - reference stays as a separate free-text
-- field (a PO number, etc.), this is the actual sequential invoice number.
alter table invoices add column invoice_number text;

-- Same publishable-token pattern as quotes.accept_token - lets "Send
-- invoice" email a public, no-login link to view/download the invoice (and
-- eventually pay it) without needing a customer login system.
alter table invoices add column view_token uuid not null default gen_random_uuid();
alter table invoices add column sent_at timestamptz;

create unique index invoices_view_token_idx on invoices(view_token);

-- Atomic increment-and-return, called through the service-role admin client
-- (same as every other tenant write - see updateTenantSettings) so two
-- quotes/invoices created at once can never collide on the same number.
create or replace function increment_quote_number(p_tenant_id uuid)
returns int language sql as $$
  update tenants set next_quote_number = next_quote_number + 1
  where id = p_tenant_id
  returning next_quote_number - 1;
$$;

create or replace function increment_invoice_number(p_tenant_id uuid)
returns int language sql as $$
  update tenants set next_invoice_number = next_invoice_number + 1
  where id = p_tenant_id
  returning next_invoice_number - 1;
$$;

-- Public bucket for logos - shown on quote/invoice PDFs and potentially the
-- tenant's own site, same public-read reasoning as project-photos.
insert into storage.buckets (id, name, public)
values ('tenant-assets', 'tenant-assets', true)
on conflict (id) do nothing;

create policy "member can upload own tenant assets" on storage.objects
  for insert with check (
    bucket_id = 'tenant-assets'
    and exists (
      select 1 from memberships m
      where m.user_id = auth.uid()
      and (storage.foldername(name))[1] = m.tenant_id::text
    )
  );

create policy "member can delete own tenant assets" on storage.objects
  for delete using (
    bucket_id = 'tenant-assets'
    and exists (
      select 1 from memberships m
      where m.user_id = auth.uid()
      and (storage.foldername(name))[1] = m.tenant_id::text
    )
  );

create policy "public can view tenant assets" on storage.objects
  for select using (bucket_id = 'tenant-assets');
