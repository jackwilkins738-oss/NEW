"use server";

// Invoicing and job costs - everything that moves money. Invoices are what
// the customer receives; cost items are what the job actually spent, and the
// two together are what the margin figures on the dashboard are built from.
//
// Split out of the single 1,576-line app/actions.ts; app/actions.ts is now
// a barrel that re-exports this, so import sites are unchanged.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { formatGBP } from "@/lib/format";
import { todayInUK } from "@/lib/ukDate";
import { logAudit } from "@/lib/auditLog";

const COST_CATEGORIES = ["materials", "labour", "subcontractors", "plant", "other"];

async function nextInvoiceNumber(tenantId: string): Promise<string> {
  const admin = createAdminClient();
  const { data: tenant } = await admin.from("tenants").select("invoice_number_prefix").eq("id", tenantId).maybeSingle();
  const { data: n } = await admin.rpc("increment_invoice_number", { p_tenant_id: tenantId });
  return `${tenant?.invoice_number_prefix ?? "INV"}-${String(n ?? 1).padStart(4, "0")}`;
}

// Accepting tenantId from the client form isn't a trust issue: the RLS
// policy on invoices (supabase/schema.sql) only allows the insert through
// if the signed-in user actually has a membership row for that tenant_id -
// someone can't invoice into a business they don't belong to just by
// editing the hidden field.
export async function addInvoice(formData: FormData) {
  const tenantId = String(formData.get("tenantId") ?? "");
  const clientName = String(formData.get("clientName") ?? "").trim();
  const reference = String(formData.get("reference") ?? "").trim();
  const milestone = String(formData.get("milestone") ?? "").trim();
  const projectId = String(formData.get("projectId") ?? "").trim();
  const leadId = String(formData.get("leadId") ?? "").trim();
  const amountPounds = Number(formData.get("amount"));
  const dueDate = String(formData.get("dueDate") ?? "");

  if (!tenantId || !clientName || !dueDate || !Number.isFinite(amountPounds) || amountPounds <= 0) {
    return;
  }

  const supabase = createClient();

  // A project's customer_id is copied onto the invoice at creation time (not
  // looked up later) so the customer page's invoice list stays correct even
  // if the project's own customer link changes afterwards.
  let customerId: string | null = null;
  if (projectId) {
    const { data: project } = await supabase.from("projects").select("customer_id").eq("id", projectId).maybeSingle();
    customerId = project?.customer_id ?? null;
  }

  await supabase.from("invoices").insert({
    tenant_id: tenantId,
    invoice_number: await nextInvoiceNumber(tenantId),
    client_name: clientName,
    reference: reference || null,
    milestone: milestone || null,
    project_id: projectId || null,
    lead_id: leadId || null,
    customer_id: customerId,
    amount_pence: Math.round(amountPounds * 100),
    due_date: dueDate,
    status: "unpaid",
  });

  revalidatePath("/dashboard");
  if (projectId) revalidatePath(`/projects/${projectId}`);
}

export async function markInvoicePaid(invoiceId: string) {
  const supabase = createClient();
  const { data: invoice } = await supabase
    .from("invoices")
    .select("amount_pence, project_id, tenant_id, client_name")
    .eq("id", invoiceId)
    .maybeSingle();
  await supabase.from("invoices").update({ status: "paid", paid_pence: invoice?.amount_pence ?? 0 }).eq("id", invoiceId);
  revalidatePath("/dashboard");
  if (invoice?.project_id) revalidatePath(`/projects/${invoice.project_id}`);
  if (invoice) {
    const { data: userData } = await supabase.auth.getUser();
    await logAudit({
      tenantId: invoice.tenant_id,
      userId: userData.user?.id,
      action: "invoice.marked_paid",
      entityType: "invoice",
      entityId: invoiceId,
      summary: `Marked ${invoice.client_name}'s invoice as paid (${formatGBP(invoice.amount_pence)})`,
    });
  }
}

// Supports part-payment: paid_pence accumulates, status becomes "paid" once
// it reaches the full amount and "part_paid" otherwise - due/overdue stay
// computed from due_date wherever they're shown, unaffected by this.
export async function recordInvoicePayment(invoiceId: string, amountPounds: number) {
  if (!Number.isFinite(amountPounds) || amountPounds <= 0) return;

  const supabase = createClient();
  const { data: invoice } = await supabase
    .from("invoices")
    .select("amount_pence, paid_pence, project_id, tenant_id, client_name")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!invoice) return;

  const newPaidPence = Math.min(invoice.amount_pence, (invoice.paid_pence ?? 0) + Math.round(amountPounds * 100));
  await supabase
    .from("invoices")
    .update({ paid_pence: newPaidPence, status: newPaidPence >= invoice.amount_pence ? "paid" : "part_paid" })
    .eq("id", invoiceId);

  revalidatePath("/dashboard");
  if (invoice.project_id) revalidatePath(`/projects/${invoice.project_id}`);

  const { data: userData } = await supabase.auth.getUser();
  await logAudit({
    tenantId: invoice.tenant_id,
    userId: userData.user?.id,
    action: "invoice.payment_recorded",
    entityType: "invoice",
    entityId: invoiceId,
    summary: `Recorded a ${formatGBP(Math.round(amountPounds * 100))} payment for ${invoice.client_name}'s invoice`,
  });
}

export async function deleteInvoice(invoiceId: string) {
  const supabase = createClient();
  const { data: invoice } = await supabase
    .from("invoices")
    .select("tenant_id, client_name, amount_pence")
    .eq("id", invoiceId)
    .maybeSingle();
  await supabase.from("invoices").delete().eq("id", invoiceId);
  revalidatePath("/dashboard");
  if (invoice) {
    const { data: userData } = await supabase.auth.getUser();
    await logAudit({
      tenantId: invoice.tenant_id,
      userId: userData.user?.id,
      action: "invoice.deleted",
      entityType: "invoice",
      entityId: invoiceId,
      summary: `Deleted ${invoice.client_name}'s invoice (${formatGBP(invoice.amount_pence)})`,
    });
  }
}

// The "sendable at a click of a button" invoice: emails the customer a link
// to the public invoice page (view + PDF download), same publishable-token
// pattern as sendQuote. Recipient resolution falls back through
// customer_id -> lead_id -> the linked project's own customer_id, since
// older invoices (before addInvoice started copying customer_id at
// creation) may only have the project link.
export async function sendInvoice(invoiceId: string, tenantId: string) {
  const supabase = createClient();

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, tenant_id, client_name, invoice_number, amount_pence, view_token, customer_id, lead_id, project_id")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!invoice || invoice.tenant_id !== tenantId) return { ok: false as const, reason: "not_found" as const };

  let recipient: string | null = null;
  if (invoice.customer_id) {
    const { data: customer } = await supabase.from("customers").select("email").eq("id", invoice.customer_id).maybeSingle();
    recipient = customer?.email ?? null;
  }
  if (!recipient && invoice.lead_id) {
    const { data: lead } = await supabase.from("leads").select("email").eq("id", invoice.lead_id).maybeSingle();
    recipient = lead?.email ?? null;
  }
  let portalToken: string | null = null;
  if (invoice.project_id) {
    const { data: project } = await supabase
      .from("projects")
      .select("customer_id, portal_token")
      .eq("id", invoice.project_id)
      .maybeSingle();
    portalToken = project?.portal_token ?? null;
    if (!recipient && project?.customer_id) {
      const { data: customer } = await supabase.from("customers").select("email").eq("id", project.customer_id).maybeSingle();
      recipient = customer?.email ?? null;
    }
  }
  if (!recipient) return { ok: false as const, reason: "no_email" as const };

  const { data: tenant } = await supabase
    .from("tenants")
    .select("business_name, domain, contact_email")
    .eq("id", tenantId)
    .maybeSingle();
  const businessName = tenant?.business_name ?? "your contractor";
  const origin = tenant?.domain ? `https://${tenant.domain}` : "https://scalardigital.co.uk";
  const viewUrl = `${origin}/invoice/${invoice.id}/${invoice.view_token}`;
  const portalUrl = invoice.project_id && portalToken ? `${origin}/portal/${invoice.project_id}/${portalToken}` : null;

  await sendEmail({
    to: [recipient],
    subject: `Invoice from ${businessName}${invoice.invoice_number ? ` (${invoice.invoice_number})` : ""}`,
    html: `
      <p>Hi ${invoice.client_name},</p>
      <p>${businessName} has sent you an invoice for ${formatGBP(invoice.amount_pence)}.</p>
      <p><a href="${viewUrl}">View and download your invoice</a></p>
      ${portalUrl ? `<p><a href="${portalUrl}">View your full project</a></p>` : ""}
    `,
    replyTo: tenant?.contact_email ?? undefined,
  });

  await supabase.from("invoices").update({ sent_at: new Date().toISOString() }).eq("id", invoiceId);
  revalidatePath("/dashboard");
  if (invoice.project_id) revalidatePath(`/projects/${invoice.project_id}`);
  return { ok: true as const };
}

// One-click, same shape as convertLeadToProject/convertQuoteToProject - an
// approved variation's customer price becomes a standalone invoice against
// the same project, so extra work doesn't just sit as a bigger project
// value with nothing actually billed for it.
export async function createInvoiceFromVariation(projectId: string, variationId: string) {
  const supabase = createClient();

  const { data: variation } = await supabase
    .from("variations")
    .select("id, tenant_id, number, description, customer_price_pence, status, invoice_id")
    .eq("id", variationId)
    .maybeSingle();
  if (!variation || variation.status !== "approved" || variation.invoice_id || variation.customer_price_pence <= 0) return;

  const { data: project } = await supabase.from("projects").select("client_name").eq("id", projectId).maybeSingle();
  const dueDate = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);

  const { data: invoice } = await supabase
    .from("invoices")
    .insert({
      tenant_id: variation.tenant_id,
      invoice_number: await nextInvoiceNumber(variation.tenant_id),
      project_id: projectId,
      client_name: project?.client_name ?? "Client",
      reference: variation.number,
      amount_pence: variation.customer_price_pence,
      due_date: dueDate,
      status: "unpaid",
    })
    .select("id")
    .single();

  if (invoice?.id) {
    await supabase.from("variations").update({ invoice_id: invoice.id }).eq("id", variationId);
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
}

// A cost item starts "committed" the moment it's logged (an order placed, a
// sub booked) and only becomes "actual" once markCostItemPaid is called -
// see migration 017 for why that's the whole budget/committed/actual model.
export async function addProjectCostItem(formData: FormData) {
  const tenantId = String(formData.get("tenantId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  const category = String(formData.get("category") ?? "other");
  const amountPounds = Number(formData.get("amount"));
  if (!tenantId || !projectId || !Number.isFinite(amountPounds) || amountPounds < 0) return;

  await createClient()
    .from("project_cost_items")
    .insert({
      tenant_id: tenantId,
      project_id: projectId,
      category: COST_CATEGORIES.includes(category) ? category : "other",
      description: String(formData.get("description") ?? "").trim() || null,
      supplier: String(formData.get("supplier") ?? "").trim() || null,
      amount_pence: Math.round(amountPounds * 100),
      cost_date: String(formData.get("costDate") ?? "") || todayInUK(),
      notes: String(formData.get("notes") ?? "").trim() || null,
      status: "committed",
    });

  revalidatePath(`/projects/${projectId}`);
}

// projectId first (not itemId) so this can be pre-bound with
// .bind(null, project.id) and handed to DeleteButton, which calls its
// action with a single remaining id argument.
export async function markCostItemPaid(projectId: string, itemId: string) {
  const supabase = createClient();
  await supabase.from("project_cost_items").update({ status: "paid" }).eq("id", itemId);
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteProjectCostItem(projectId: string, itemId: string) {
  const supabase = createClient();
  await supabase.from("project_cost_items").delete().eq("id", itemId);
  revalidatePath(`/projects/${projectId}`);
}
