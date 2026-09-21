"use server";

// Tenant-level settings: business profile, branding and contact details.
//
// Split out of the single 1,576-line app/actions.ts; app/actions.ts is now
// a barrel that re-exports this, so import sites are unchanged.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/auditLog";

// The only RLS update policy on tenants is "platform admin can update
// tenants" (schema.sql) - a regular business owner can't write to their own
// tenant row through the session-scoped client at all. Rather than widen
// that policy (which would let any member rewrite domain/site_key/slug too,
// not just contact_email), this checks membership itself and then writes
// through the service-role admin client - same pattern already used for
// calendar_connections and platform_admins.
export async function updateTenantContactEmail(tenantId: string, email: string) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return;

  const { data: membership } = await supabase
    .from("memberships")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!membership) return;

  const admin = createAdminClient();
  await admin.from("tenants").update({ contact_email: email.trim() || null }).eq("id", tenantId);
  revalidatePath("/dashboard");
}

// Same membership-check-then-admin-write pattern as updateTenantContactEmail
// above, for the same reason: tenants only has an RLS update policy for
// platform admins, and this needs to be settable by the business owner.
export async function updateTenantSettings(tenantId: string, formData: FormData) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return;

  const { data: membership } = await supabase
    .from("memberships")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!membership) return;

  const vatRate = Number(formData.get("defaultVatRate") ?? 20);
  const quoteTerms = String(formData.get("defaultQuoteTerms") ?? "").trim();
  const paymentTerms = String(formData.get("defaultPaymentTerms") ?? "").trim();
  const googleReviewUrl = String(formData.get("googleReviewUrl") ?? "").trim();
  const companyAddress = String(formData.get("companyAddress") ?? "").trim();
  const vatNumber = String(formData.get("vatNumber") ?? "").trim();
  const bankDetails = String(formData.get("bankDetails") ?? "").trim();
  const quoteNumberPrefix = String(formData.get("quoteNumberPrefix") ?? "Q").trim();
  const invoiceNumberPrefix = String(formData.get("invoiceNumberPrefix") ?? "INV").trim();

  const admin = createAdminClient();
  await admin
    .from("tenants")
    .update({
      default_vat_rate: Number.isFinite(vatRate) && vatRate >= 0 ? vatRate : 20,
      default_quote_terms: quoteTerms || null,
      default_payment_terms: paymentTerms || null,
      google_review_url: googleReviewUrl || null,
      company_address: companyAddress || null,
      vat_number: vatNumber || null,
      bank_details: bankDetails || null,
      quote_number_prefix: quoteNumberPrefix || "Q",
      invoice_number_prefix: invoiceNumberPrefix || "INV",
    })
    .eq("id", tenantId);

  revalidatePath("/settings");
  revalidatePath("/dashboard");

  await logAudit({
    tenantId,
    userId: userData.user.id,
    action: "tenant.settings_updated",
    entityType: "tenant",
    entityId: tenantId,
    summary: "Updated business profile / quote & invoice defaults",
  });
}

const MAX_LOGO_BYTES = 3 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

export async function uploadTenantLogo(formData: FormData) {
  const tenantId = String(formData.get("tenantId") ?? "");
  const file = formData.get("logo");
  if (!tenantId || !(file instanceof File) || file.size === 0) return;
  if (file.size > MAX_LOGO_BYTES || !ALLOWED_LOGO_TYPES.includes(file.type)) return;

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return;

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : file.type === "image/svg+xml" ? "svg" : "jpg";
  const path = `${tenantId}/logo.${ext}`;

  const { error: uploadError } = await supabase.storage.from("tenant-assets").upload(path, file, {
    contentType: file.type,
    upsert: true,
  });
  if (uploadError) return;

  const { data: publicUrl } = supabase.storage.from("tenant-assets").getPublicUrl(path);

  const admin = createAdminClient();
  // Cache-bust with a timestamp query string - the storage path itself
  // (fixed as logo.<ext>, upsert: true) never changes on re-upload, so
  // without this every <img> pointing at the old URL would keep serving a
  // browser-cached copy of the previous logo.
  await admin.from("tenants").update({ logo_url: `${publicUrl.publicUrl}?v=${Date.now()}` }).eq("id", tenantId);

  revalidatePath("/settings");
  revalidatePath("/dashboard");
}

