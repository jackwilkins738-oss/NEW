"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/auditLog";
import { formatGBP } from "@/lib/format";
import { sendEmail } from "@/lib/email";
import { tenantOrigin } from "@/lib/tenantOrigin";

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

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
    .select("id, accept_token, status, tenant_id, client_name, total_pence, customer_email")
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote || quote.accept_token !== token || quote.status === "declined") {
    return { ok: false };
  }
  const firstAccept = quote.status !== "accepted";
  await admin.from("quotes").update({ status: "accepted", accepted_at: new Date().toISOString() }).eq("id", quoteId);
  const onboardingUrl = await afterAccept(quote, firstAccept);
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
  return { ok: true, onboardingUrl };
}

// Only quotes made from Scalar's own outreach (POST /api/prospects/quote)
// have an onboarding row; every other tenant's accept stops here unchanged.
// For those: the prospect is marked won, and - the first time only - the
// client is emailed their onboarding link, so it isn't lost if they close
// the page.
async function afterAccept(
  quote: { id: string; tenant_id: string; client_name: string; customer_email: string | null },
  firstAccept: boolean
): Promise<string | null> {
  const admin = createAdminClient();
  const { data: ob } = await admin
    .from("onboarding")
    .select("id, token, prospect_slug")
    .eq("quote_id", quote.id)
    .maybeSingle();
  if (!ob) return null;
  const { data: tenant } = await admin.from("tenants").select("business_name, domain, slug").eq("id", quote.tenant_id).maybeSingle();
  const url = `${tenantOrigin(tenant)}/welcome/${ob.id}/${ob.token}`;
  if (!firstAccept) return url;

  if (ob.prospect_slug) {
    await admin
      .from("prospects")
      .update({ status: "won", updated_at: new Date().toISOString() })
      .eq("tenant_id", quote.tenant_id)
      .eq("slug", ob.prospect_slug);
  }
  if (quote.customer_email) {
    const business = escapeHtml(tenant?.business_name ?? "Scalar Digital");
    await sendEmail({
      to: [quote.customer_email],
      subject: `Next step for your new website - ${quote.client_name}`,
      html: `
        <p>Hi,</p>
        <p>Thanks for accepting the quote - really looking forward to building ${escapeHtml(quote.client_name)}'s new site.</p>
        <p>The next step takes about ten minutes: tell us what you do, where you work and how customers reach you, and upload your logo and a few photos of your work. It's all on one page, and you can come back to it any time:</p>
        <p><a href="${url}">${url}</a></p>
        <p>Any questions, just reply to this email.</p>
        <p>${business}</p>`,
    });
  }
  return url;
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
