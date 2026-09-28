import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { formatGBP } from "@/lib/format";
import { tenantOrigin } from "@/lib/tenantOrigin";
import { todayInUK } from "@/lib/ukDate";

// The steps between "they said yes" and "the money's in": turning an accepted
// quote into a job, raising its invoices and emailing them. Shared by the
// dashboard's buttons (session client, RLS applies) and the customer's own
// accept click on the public quote page (service-role client, the quote's
// token is the check) - so both paths do exactly the same thing.

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Days a customer gets to pay an invoice raised from a job. */
export const INVOICE_DUE_DAYS = 14;

export function generateRef(now = new Date()) {
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `P-${stamp}-${suffix}`;
}

/** A UK date `days` after `today` (YYYY-MM-DD in, YYYY-MM-DD out). */
export function addDays(today: string, days: number): string {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * What's left to invoice on a job: its value (the quote plus approved
 * variations - approveVariation adds those to value_pence) minus every invoice
 * already raised against it, so nothing is billed twice.
 */
export function balanceToInvoice(valuePence: number | null, invoices: { amount_pence: number }[]): number {
  const raised = invoices.reduce((sum, i) => sum + (i.amount_pence ?? 0), 0);
  return Math.max(0, (valuePence ?? 0) - raised);
}

/** The deposit still to invoice: the quote's deposit, unless a deposit invoice already exists. */
export function depositToInvoice(depositPence: number | null, invoices: { milestone: string | null }[]): number {
  if (!depositPence || depositPence <= 0) return 0;
  return invoices.some((i) => (i.milestone ?? "").toLowerCase() === "deposit") ? 0 : depositPence;
}

// Matches an existing customer by email first - the closest thing to a
// stable identity either a lead form or a quote gives us - otherwise
// creates one.
export async function findOrCreateCustomer(
  db: SupabaseClient,
  tenantId: string,
  name: string,
  email: string | null,
  phone: string | null
): Promise<string | null> {
  if (email) {
    const { data: existing } = await db
      .from("customers")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("email", email)
      .maybeSingle();
    if (existing) return existing.id as string;
  }
  const { data: created } = await db.from("customers").insert({ tenant_id: tenantId, name, email, phone }).select("id").single();
  return (created?.id as string | undefined) ?? null;
}

export async function nextInvoiceNumber(tenantId: string): Promise<string> {
  const admin = createAdminClient();
  const { data: tenant } = await admin.from("tenants").select("invoice_number_prefix").eq("id", tenantId).maybeSingle();
  const { data: n } = await admin.rpc("increment_invoice_number", { p_tenant_id: tenantId });
  return `${tenant?.invoice_number_prefix ?? "INV"}-${String(n ?? 1).padStart(4, "0")}`;
}

/**
 * The job for a quote - the existing one if it was already converted, so
 * pressing the button twice (or the customer accepting after the owner
 * converted it by hand) never makes two. Null if the quote isn't this tenant's.
 */
export async function jobFromQuote(db: SupabaseClient, quoteId: string, tenantId: string): Promise<string | null> {
  const { data: quote } = await db
    .from("quotes")
    .select("id, client_name, total_pence, lead_id, customer_email, customer_phone, tenant_id")
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote || quote.tenant_id !== tenantId) return null;

  const { data: existing } = await db.from("projects").select("id").eq("quote_id", quoteId).limit(1).maybeSingle();
  if (existing) return existing.id as string;

  let email: string | null = quote.customer_email;
  let phone: string | null = quote.customer_phone;
  if ((!email || !phone) && quote.lead_id) {
    const { data: lead } = await db.from("leads").select("email, phone").eq("id", quote.lead_id).maybeSingle();
    email = email ?? lead?.email ?? null;
    phone = phone ?? lead?.phone ?? null;
  }
  const customerId = await findOrCreateCustomer(db, tenantId, quote.client_name, email, phone);

  const { data: project } = await db
    .from("projects")
    .insert({
      tenant_id: tenantId,
      ref: generateRef(),
      client_name: quote.client_name,
      quote_id: quote.id,
      lead_id: quote.lead_id,
      customer_id: customerId,
      value_pence: quote.total_pence,
      stage: "Enquiry",
      status: "on_track",
    })
    .select("id")
    .single();

  if (quote.lead_id) {
    await db.from("leads").update({ status: "won", status_updated_at: new Date().toISOString() }).eq("id", quote.lead_id);
  }
  return (project?.id as string | undefined) ?? null;
}

export type JobInvoiceKind = "deposit" | "balance";

/**
 * Raises the deposit or the final-balance invoice for a job, worked out from
 * the quote and what's already been invoiced. Null when there's nothing to
 * raise (no deposit on the quote, deposit already invoiced, nothing left).
 */
export async function raiseJobInvoice(
  db: SupabaseClient,
  projectId: string,
  tenantId: string,
  kind: JobInvoiceKind
): Promise<{ id: string; amountPence: number } | null> {
  const { data: project } = await db
    .from("projects")
    .select("id, tenant_id, client_name, value_pence, quote_id, lead_id, customer_id, ref")
    .eq("id", projectId)
    .maybeSingle();
  if (!project || project.tenant_id !== tenantId) return null;

  const { data: invoices } = await db.from("invoices").select("amount_pence, milestone").eq("project_id", projectId);
  let amountPence = 0;
  if (kind === "deposit") {
    if (!project.quote_id) return null;
    const { data: quote } = await db.from("quotes").select("deposit_pence").eq("id", project.quote_id).maybeSingle();
    amountPence = Math.min(depositToInvoice(quote?.deposit_pence ?? null, invoices ?? []), balanceToInvoice(project.value_pence, invoices ?? []));
  } else {
    amountPence = balanceToInvoice(project.value_pence, invoices ?? []);
  }
  if (amountPence <= 0) return null;

  const { data: created } = await db
    .from("invoices")
    .insert({
      tenant_id: tenantId,
      invoice_number: await nextInvoiceNumber(tenantId),
      client_name: project.client_name,
      reference: project.ref,
      milestone: kind === "deposit" ? "Deposit" : (invoices ?? []).length > 0 ? "Final balance" : null,
      project_id: project.id,
      lead_id: project.lead_id,
      customer_id: project.customer_id,
      amount_pence: amountPence,
      due_date: addDays(todayInUK(), kind === "deposit" ? 7 : INVOICE_DUE_DAYS),
      status: "unpaid",
    })
    .select("id")
    .single();
  return created ? { id: created.id as string, amountPence } : null;
}

/**
 * Emails an invoice's view-and-pay link to the customer. Finds their email
 * from the customer record, the enquiry, or the job's customer, in that order.
 */
export async function emailInvoice(
  db: SupabaseClient,
  invoiceId: string,
  tenantId: string
): Promise<{ ok: true } | { ok: false; reason: "not_found" | "no_email" }> {
  const { data: invoice } = await db
    .from("invoices")
    .select("id, tenant_id, client_name, invoice_number, amount_pence, view_token, customer_id, lead_id, project_id")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!invoice || invoice.tenant_id !== tenantId) return { ok: false, reason: "not_found" };

  let recipient: string | null = null;
  if (invoice.customer_id) {
    const { data: customer } = await db.from("customers").select("email").eq("id", invoice.customer_id).maybeSingle();
    recipient = customer?.email ?? null;
  }
  if (!recipient && invoice.lead_id) {
    const { data: lead } = await db.from("leads").select("email").eq("id", invoice.lead_id).maybeSingle();
    recipient = lead?.email ?? null;
  }
  let portalToken: string | null = null;
  if (invoice.project_id) {
    const { data: project } = await db.from("projects").select("customer_id, portal_token").eq("id", invoice.project_id).maybeSingle();
    portalToken = project?.portal_token ?? null;
    if (!recipient && project?.customer_id) {
      const { data: customer } = await db.from("customers").select("email").eq("id", project.customer_id).maybeSingle();
      recipient = customer?.email ?? null;
    }
  }
  if (!recipient) return { ok: false, reason: "no_email" };

  // contact_email isn't in the column grant the session client has (039) -
  // the invoice read above already proved this caller may act for the tenant.
  const { data: tenant } = await createAdminClient()
    .from("tenants")
    .select("business_name, domain, slug, contact_email")
    .eq("id", tenantId)
    .maybeSingle();
  const businessName = tenant?.business_name ?? "your contractor";
  const origin = tenantOrigin(tenant);
  const viewUrl = `${origin}/invoice/${invoice.id}/${invoice.view_token}`;
  const portalUrl = invoice.project_id && portalToken ? `${origin}/portal/${invoice.project_id}/${portalToken}` : null;

  await sendEmail({
    to: [recipient],
    subject: `Invoice from ${businessName}${invoice.invoice_number ? ` (${invoice.invoice_number})` : ""}`,
    html: `
      <p>Hi ${escapeHtml(invoice.client_name)},</p>
      <p>${escapeHtml(businessName)} has sent you an invoice for ${formatGBP(invoice.amount_pence)}.</p>
      <p><a href="${viewUrl}">View and download your invoice</a></p>
      ${portalUrl ? `<p><a href="${portalUrl}">View your full project</a></p>` : ""}
    `,
    replyTo: tenant?.contact_email ?? undefined,
  });

  await db.from("invoices").update({ sent_at: new Date().toISOString() }).eq("id", invoiceId);
  return { ok: true };
}

/** Everyone at the business who should hear about something: members with a login, plus the alerts address. */
export async function businessRecipients(admin: SupabaseClient, tenantId: string, contactEmail: string | null): Promise<string[]> {
  const { data: memberships } = await admin.from("memberships").select("user_id").eq("tenant_id", tenantId);
  const emails = new Set<string>();
  for (const m of memberships ?? []) {
    const { data } = await admin.auth.admin.getUserById(m.user_id);
    if (data.user?.email) emails.add(data.user.email.toLowerCase());
  }
  if (contactEmail) emails.add(contactEmail.toLowerCase());
  return [...emails];
}
