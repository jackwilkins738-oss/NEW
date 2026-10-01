-- Optional extras on a quote (lib/quoteExtras.ts): things the customer can
-- tick on the quote page before they sign - an extra page, a logo tidy-up.
-- [{ "description": text, "price_pence": int }], each price before VAT. The
-- ones they tick become ordinary lines of the quote when they accept, so the
-- signed quote, the job and the invoices all carry the real total.
alter table quotes add column if not exists optional_items jsonb not null default '[]'::jsonb
  check (jsonb_typeof(optional_items) = 'array' and jsonb_array_length(optional_items) <= 8);
