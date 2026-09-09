"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/auditLog";
import { formatGBP } from "@/lib/format";

// Public, unauthenticated actions - a customer reaches these from the
// no-login accept/decline page (app/quote/[id]/[token]). The accept_token
// match IS the security boundary here (same publishable-token idea as
// tenants.site_key), which is why this goes through the service-role admin
// client rather than the session-scoped one everything in the dashboard
// uses - there's no signed-in user for RLS to check.
export async function acceptQuote(quoteId: string, token: string) {
  const admin = createAdminClient();
  const { data: quote } = await admin
    .from("quotes")
    .select("id, accept_token, status, tenant_id, client_name, total_pence")
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote || quote.accept_token !== token || quote.status === "declined") {
    return { ok: false };
  }
  await admin.from("quotes").update({ status: "accepted", accepted_at: new Date().toISOString() }).eq("id", quoteId);
  revalidatePath(`/quote/${quoteId}/${token}`);
  // No signed-in user here - a customer action, not staff, so userId is
  // deliberately omitted rather than attributed to nobody in particular.
  await logAudit({
    tenantId: quote.tenant_id,
    action: "quote.accepted",
    entityType: "quote",
    entityId: quoteId,
    summary: `${quote.client_name} accepted their quote (${formatGBP(quote.total_pence)})`,
  });
  return { ok: true };
}

export async function declineQuote(quoteId: string, token: string) {
  const admin = createAdminClient();
  const { data: quote } = await admin
    .from("quotes")
    .select("id, accept_token, status, tenant_id, client_name")
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote || quote.accept_token !== token || quote.status === "accepted") {
    return { ok: false };
  }
  await admin.from("quotes").update({ status: "declined", declined_at: new Date().toISOString() }).eq("id", quoteId);
  revalidatePath(`/quote/${quoteId}/${token}`);
  await logAudit({
    tenantId: quote.tenant_id,
    action: "quote.declined",
    entityType: "quote",
    entityId: quoteId,
    summary: `${quote.client_name} declined their quote`,
  });
  return { ok: true };
}
