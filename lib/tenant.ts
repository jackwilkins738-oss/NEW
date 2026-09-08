import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

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
};

// Figures out which customer this request is for, purely from the hostname
// it arrived on:
//   dashboard.ridgeviewlofts.co.uk  -> tenants.domain match
//   ridgeview.localhost:3000        -> tenants.slug match (local dev)
export async function getCurrentTenant(): Promise<Tenant | null> {
  const host = headers().get("host")?.split(":")[0] ?? "";
  const supabase = createClient();

  const byDomain = await supabase
    .from("tenants")
    .select("id, business_name, slug, domain, brand_theme, contact_email, default_vat_rate, default_quote_terms, default_payment_terms, google_review_url")
    .eq("domain", host)
    .maybeSingle();

  if (byDomain.data) return byDomain.data;

  const subdomain = host.split(".")[0];
  const bySlug = await supabase
    .from("tenants")
    .select("id, business_name, slug, domain, brand_theme, contact_email, default_vat_rate, default_quote_terms, default_payment_terms, google_review_url")
    .eq("slug", subdomain)
    .maybeSingle();

  return bySlug.data ?? null;
}
