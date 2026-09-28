"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/auditLog";
import { formatGBP } from "@/lib/format";
import { sendEmail } from "@/lib/email";
import { tenantOrigin } from "@/lib/tenantOrigin";
import { businessRecipients, emailInvoice, jobFromQuote, raiseJobInvoice } from "@/lib/jobs";

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
    .select("id, accept_token, status, tenant_id, client_name, total_pence, customer_email, quote_number")
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote || quote.accept_token !== token || quote.status === "declined") {
    return { ok: false };
  }
  const firstAccept = quote.status !== "accepted";
  await admin.from("quotes").update({ status: "accepted", accepted_at: new Date().toISOString() }).eq("id", quoteId);
  const onboardingUrl = await afterAccept(quote, firstAccept);
  // The business's side runs after the customer's page has answered, and a
  // failure in it never turns their "accepted" into an error.
  if (firstAccept) {
    after(() =>
      startJob(quote).catch((err) => {
        console.error(`After-accept steps failed for quote ${quote.id}:`, err);
        Sentry.captureException(err);
      })
    );
  }
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

// A yes from the customer, turned straight into work: the job is created
// (the same one "Convert to project" would make, never a second), the deposit
// invoice is emailed to them if the business switched that on in Settings
// (otherwise the alert says what to invoice, one tap away) - and everyone at the
// business is told at once instead of finding out next time they log in.
async function startJob(quote: { id: string; tenant_id: string; client_name: string; total_pence: number; quote_number: string | null }) {
  const admin = createAdminClient();
  const { data: tenant } = await admin
    .from("tenants")
    .select("business_name, domain, slug, contact_email")
    .eq("id", quote.tenant_id)
    .maybeSingle();
  if (!tenant) return;
  // Its own read: the column arrives with migration 046, and a database
  // without it yet should just behave as "switched off".
  const { data: autoSendRow } = await admin.from("tenants").select("auto_send_deposit").eq("id", quote.tenant_id).maybeSingle();
  const autoSend = !!(autoSendRow as { auto_send_deposit?: boolean } | null)?.auto_send_deposit;

  const projectId = await jobFromQuote(admin, quote.id, quote.tenant_id);
  let depositLine = "";
  if (projectId && autoSend) {
    const deposit = await raiseJobInvoice(admin, projectId, quote.tenant_id, "deposit");
    if (deposit) {
      const sent = await emailInvoice(admin, deposit.id, quote.tenant_id);
      depositLine = sent.ok
        ? `The deposit invoice (${formatGBP(deposit.amountPence)}) has been emailed to them.`
        : `The deposit invoice (${formatGBP(deposit.amountPence)}) is raised, but there's no email address for them - send it another way.`;
    }
  } else if (projectId) {
    const { data: q } = await admin.from("quotes").select("deposit_pence").eq("id", quote.id).maybeSingle();
    if (q?.deposit_pence && q.deposit_pence > 0) {
      depositLine = `Their deposit is ${formatGBP(q.deposit_pence)} - one tap on "Invoice the deposit" on the job sends it.`;
    }
  }

  const to = await businessRecipients(admin, quote.tenant_id, tenant.contact_email);
  if (to.length === 0) return;
  const origin = tenantOrigin(tenant);
  const jobUrl = projectId ? `${origin}/projects/${projectId}` : `${origin}/dashboard`;
  await sendEmail({
    to,
    subject: `Quote accepted: ${quote.client_name} (${formatGBP(quote.total_pence)})`,
    html: `
      <div style="font-family:Helvetica,Arial,sans-serif;color:#17140f;">
        <p style="font-size:16px;"><strong>${escapeHtml(quote.client_name)}</strong> has accepted your quote${
          quote.quote_number ? ` ${escapeHtml(quote.quote_number)}` : ""
        } for <strong>${formatGBP(quote.total_pence)}</strong>.</p>
        <p>${projectId ? "It's on your dashboard as a job now." : ""} ${depositLine}</p>
        <p><a href="${jobUrl}" style="display:inline-block;background:#17140f;color:#fff;text-decoration:none;font-weight:bold;padding:10px 20px;border-radius:8px;">Open the job</a></p>
        <p style="color:#6b6255;font-size:13px;">Next: give them a call to book the start date.</p>
      </div>`,
  });
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
