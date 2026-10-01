"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { after } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/auditLog";
import { formatGBP } from "@/lib/format";
import { sendEmail } from "@/lib/email";
import { tenantOrigin } from "@/lib/tenantOrigin";
import { cleanSignature } from "@/lib/signature";
import { sendPush } from "@/lib/push";
import { businessRecipients, emailInvoice, jobFromQuote, raiseJobInvoice } from "@/lib/jobs";
import { tokensMatch } from "@/lib/tokens";
import { chosenExtras, parseExtras, withExtras } from "@/lib/quoteExtras";

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// Public, unauthenticated actions - a customer reaches these from the
// no-login accept/decline page (app/quote/[id]/[token]). The accept_token
// match IS the security boundary here (same publishable-token idea as
// tenants.site_key), which is why this goes through the service-role admin
// client rather than the session-scoped one everything in the dashboard
// uses - there's no signed-in user for RLS to check.
export async function acceptQuote(
  quoteId: string,
  token: string,
  signature?: { name: string; agreed: boolean },
  extras?: number[]
) {
  const admin = createAdminClient();
  const { data: quote } = await admin
    .from("quotes")
    .select("id, accept_token, status, tenant_id, client_name, total_pence, customer_email, quote_number, deposit_pence")
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote || !tokensMatch(quote.accept_token, token) || quote.status === "declined") {
    return { ok: false };
  }
  let firstAccept = quote.status !== "accepted";
  const signedName = cleanSignature(signature?.name);
  if (firstAccept && (!signedName || !signature?.agreed)) {
    return { ok: false, error: "Type your full name and tick the box to accept." };
  }
  const acceptedAt = new Date().toISOString();
  if (firstAccept) {
    // The extras they ticked become lines of the quote they're signing - in
    // the same update as the signature, worked out from the quote as sent, so
    // a double tap writes the same thing twice rather than adding them twice.
    const priced = await pricedWithExtras(admin, quoteId, extras);
    if (priced) {
      quote.total_pence = priced.total_pence;
      quote.deposit_pence = priced.deposit_pence;
    }
    const h = await headers();
    const signed = {
      ...priced,
      status: "accepted",
      accepted_at: acceptedAt,
      accepted_name: signedName,
      accepted_ip: (h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "").slice(0, 64) || null,
      accepted_user_agent: (h.get("user-agent") || "").slice(0, 300) || null,
    };
    // Only while it isn't accepted yet: a second tap landing at the same time
    // changes nothing (and doesn't add the extras again).
    const first = await admin.from("quotes").update(signed).eq("id", quoteId).neq("status", "accepted").select("id");
    let result: { data: { id: string }[] | null; error: unknown } = first;
    // Before migration 050 the signature columns don't exist: still accept, just without them.
    if (first.error) {
      result = await admin
        .from("quotes")
        .update({ ...priced, status: "accepted", accepted_at: acceptedAt })
        .eq("id", quoteId)
        .neq("status", "accepted")
        .select("id");
    }
    // Saved fine but nothing changed: another tap accepted it a moment ago.
    if (!result.error && !result.data?.length) firstAccept = false;
  }
  const onboardingUrl = await afterAccept(quote, firstAccept);
  const depositUrl = await depositPayment(quote);
  // The business's side runs after the customer's page has answered, and a
  // failure in it never turns their "accepted" into an error.
  if (firstAccept) {
    after(() =>
      startJob(quote, signedName, acceptedAt).catch((err) => {
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
    summary: `${quote.client_name} accepted their quote (${formatGBP(quote.total_pence)})${signedName ? `, signed "${signedName}"` : ""}`,
  });
  return { ok: true, onboardingUrl, depositUrl };
}

/** The quote's new lines and totals with the ticked extras, or null when none were ticked (or before migration 058). */
async function pricedWithExtras(admin: ReturnType<typeof createAdminClient>, quoteId: string, picked: unknown) {
  if (!Array.isArray(picked) || picked.length === 0) return null;
  const { data: q, error } = await admin
    .from("quotes")
    .select("optional_items, line_items, markup_percent, vat_rate, total_pence, deposit_pence")
    .eq("id", quoteId)
    .maybeSingle();
  if (error || !q) return null;
  return withExtras(q, chosenExtras(parseExtras(q.optional_items), picked));
}

/**
 * The deposit, payable the moment they say yes: when the quote asks for one
 * and the business takes card payments (Stripe connected), the job and its
 * deposit invoice are made now - the same ones the steps after acceptance
 * would make, never a second - and the customer gets the invoice's pay page.
 */
async function depositPayment(quote: { id: string; tenant_id: string; deposit_pence: number | null }): Promise<string | null> {
  if (!quote.deposit_pence || quote.deposit_pence <= 0) return null;
  const admin = createAdminClient();
  const { data: tenant } = await admin.from("tenants").select("stripe_account_id, domain, slug").eq("id", quote.tenant_id).maybeSingle();
  if (!tenant?.stripe_account_id) return null;
  try {
    const projectId = await jobFromQuote(admin, quote.id, quote.tenant_id);
    if (!projectId) return null;
    await raiseJobInvoice(admin, projectId, quote.tenant_id, "deposit");
    const { data: invoice } = await admin
      .from("invoices")
      .select("id, view_token, status")
      .eq("project_id", projectId)
      .ilike("milestone", "deposit")
      .limit(1)
      .maybeSingle();
    if (!invoice || invoice.status === "paid") return null;
    return `${tenantOrigin(tenant)}/invoice/${invoice.id}/${invoice.view_token}`;
  } catch (err) {
    console.error(`Deposit payment setup failed for quote ${quote.id}:`, err);
    Sentry.captureException(err);
    return null;
  }
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
        <p>The next step takes about ten minutes: tell us what you do, where you work and how customers reach you, and upload your logo and a few photos of your work. It's a few short steps, it saves as you go, and you can come back to it any time:</p>
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
async function startJob(
  quote: { id: string; tenant_id: string; client_name: string; total_pence: number; quote_number: string | null; customer_email: string | null; accept_token?: string },
  signedName: string | null,
  acceptedAt: string
) {
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
  if (projectId) {
    // The deposit invoice may already exist - made when they accepted, so they could pay by card straight away.
    const { data: existing } = await admin
      .from("invoices")
      .select("id, amount_pence, sent_at")
      .eq("project_id", projectId)
      .ilike("milestone", "deposit")
      .limit(1)
      .maybeSingle();
    let deposit = existing ? { id: existing.id as string, amountPence: existing.amount_pence as number } : null;
    if (!deposit && autoSend) deposit = await raiseJobInvoice(admin, projectId, quote.tenant_id, "deposit");
    if (deposit && autoSend && !existing?.sent_at) {
      const sent = await emailInvoice(admin, deposit.id, quote.tenant_id);
      depositLine = sent.ok
        ? `The deposit invoice (${formatGBP(deposit.amountPence)}) has been emailed to them.`
        : `The deposit invoice (${formatGBP(deposit.amountPence)}) is raised, but there's no email address for them - send it another way.`;
    } else if (deposit) {
      depositLine = `They were offered their ${formatGBP(deposit.amountPence)} deposit to pay by card as they accepted - you'll see it marked paid if they did.`;
    } else {
      const { data: q } = await admin.from("quotes").select("deposit_pence").eq("id", quote.id).maybeSingle();
      if (q?.deposit_pence && q.deposit_pence > 0) {
        depositLine = `Their deposit is ${formatGBP(q.deposit_pence)} - one tap on "Invoice the deposit" on the job sends it.`;
      }
    }
  }

  // The customer's copy of what they agreed to.
  if (quote.customer_email && signedName) {
    const quoteUrl = quote.accept_token ? `${tenantOrigin(tenant)}/quote/${quote.id}/${quote.accept_token}` : null;
    const when = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", dateStyle: "long", timeStyle: "short" }).format(new Date(acceptedAt));
    await sendEmail({
      to: [quote.customer_email],
      subject: `You accepted your quote from ${tenant.business_name}${quote.quote_number ? ` (${quote.quote_number})` : ""}`,
      html: `<p>Hi ${escapeHtml(quote.client_name)},</p>
        <p>Thanks - this confirms you accepted the quote${quote.quote_number ? ` ${escapeHtml(quote.quote_number)}` : ""} from ${escapeHtml(tenant.business_name)} for <strong>${formatGBP(quote.total_pence)}</strong>, including its terms, on ${escapeHtml(when)}, signed as "${escapeHtml(signedName)}".</p>
        ${quoteUrl ? `<p><a href="${quoteUrl}">View the quote you accepted</a></p>` : ""}
        <p>Keep this email for your records. We'll be in touch to arrange the next steps.</p>
        <p>${escapeHtml(tenant.business_name)}</p>`,
      replyTo: tenant.contact_email ?? undefined,
    });
  }

  await sendPush(admin, quote.tenant_id, {
    title: `Quote accepted: ${quote.client_name}`,
    body: `${formatGBP(quote.total_pence)}${quote.quote_number ? ` (${quote.quote_number})` : ""} - it's on your dashboard as a job.`,
    url: projectId ? `/projects/${projectId}` : "/dashboard",
  }).catch((err) => Sentry.captureException(err));

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
  if (!quote || !tokensMatch(quote.accept_token, token) || quote.status === "accepted") {
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
