import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

export type Tenant = {
  id: string;
  business_name: string;
  slug: string;
  domain: string | null;
  brand_theme: string;
  contact_email: string | null;
  default_vat_rate: number;
  default_quote_terms: string | null;
  default_payment_terms: string | null;
  google_review_url: string | null;
  company_address: string | null;
  vat_number: string | null;
  bank_details: string | null;
  logo_url: string | null;
  quote_number_prefix: string;
  invoice_number_prefix: string;
  stripe_account_id: string | null;
};

const TENANT_COLUMNS =
  "id, business_name, slug, domain, brand_theme, contact_email, default_vat_rate, default_quote_terms, default_payment_terms, google_review_url, company_address, vat_number, bank_details, logo_url, quote_number_prefix, invoice_number_prefix, stripe_account_id";

// Figures out which customer this request is for, purely from the hostname
// it arrived on:
//   dashboard.ridgeviewlofts.co.uk  -> tenants.domain match
//   ridgeview.localhost:3000        -> tenants.slug match (local dev)
//
// Uses the admin client, not the session-scoped one: this runs before any
// membership check (it's what the login page and public branding routes
// call before anyone's signed in), and several of TENANT_COLUMNS - bank
// details, VAT number, the Stripe account id - are deliberately not among
// the columns anon/authenticated can select at all (see
// 039_restrict_tenant_columns.sql), so a plain session-scoped query would
// fail outright for every caller, member or not. That column restriction is
// what actually protects this data now; every real authorization decision
// downstream of this lookup (the dashboard layout's membership check,
// Settings' owner-only gate, signIn()'s membership check) was already
// independent of which client fetched the row here.
export async function getCurrentTenant(): Promise<Tenant | null> {
  const host = headers().get("host")?.split(":")[0] ?? "";
  const admin = createAdminClient();

  const byDomain = await admin.from("tenants").select(TENANT_COLUMNS).eq("domain", host).maybeSingle();

  if (byDomain.data) return byDomain.data;

  const subdomain = host.split(".")[0];
  const bySlug = await admin.from("tenants").select(TENANT_COLUMNS).eq("slug", subdomain).maybeSingle();

  return bySlug.data ?? null;
}
