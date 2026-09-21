"use server";

// The sales pipeline: a lead comes in from a tenant's website, becomes a
// quote, and a won quote becomes a project. Customer records live here too,
// since they're created off the back of that same flow.
//
// Split out of the single 1,576-line app/actions.ts; app/actions.ts is now
// a barrel that re-exports this, so import sites are unchanged.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { formatGBP } from "@/lib/format";
import { parseLineItems, computeQuoteTotals } from "@/lib/quoteMath";
import { logAudit } from "@/lib/auditLog";
import { generateRef } from "@/lib/projectRef";

const VALID_STATUSES = ["new", "contacted", "survey_booked", "quoted", "won", "lost"];

// Shared by both conversion paths below (lead -> project, quote -> project).
// Matches an existing customer by email first - the closest thing to a
// stable identity either a lead form or a quote gives us - otherwise
// creates one.
async function findOrCreateCustomer(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  name: string,
  email: string | null,
  phone: string | null
) {
  if (email) {
    const { data: existing } = await supabase
      .from("customers")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("email", email)
      .maybeSingle();
    if (existing) return existing.id as string;
  }
  const { data: created } = await supabase
    .from("customers")
    .insert({ tenant_id: tenantId, name, email, phone })
    .select("id")
    .single();
  return (created?.id as string | undefined) ?? null;
}

// Sequential (Q-0001, Q-0002...), not the old random Q-YYYYMM-XXXX - a real
// business wants these in order. increment_quote_number (migration 032) is
// an atomic update-and-return so two quotes created at once can't collide;
// called through the admin client since tenants' own RLS update policy is
// platform-admin-only (same reason every other tenant write in this file
// goes through admin).
async function nextQuoteNumber(tenantId: string): Promise<string> {
  const admin = createAdminClient();
  const { data: tenant } = await admin.from("tenants").select("quote_number_prefix").eq("id", tenantId).maybeSingle();
  const { data: n } = await admin.rpc("increment_quote_number", { p_tenant_id: tenantId });
  return `${tenant?.quote_number_prefix ?? "Q"}-${String(n ?? 1).padStart(4, "0")}`;
}

// Row-level security (see supabase/schema.sql) is what actually stops one
// tenant's member updating another tenant's lead - the .eq("id", leadId)
// here just narrows the query, it isn't the security boundary.
export async function updateLeadStatus(leadId: string, status: string) {
  if (!VALID_STATUSES.includes(status)) return;

  const supabase = createClient();
  await supabase
    .from("leads")
    .update({ status, status_updated_at: new Date().toISOString() })
    .eq("id", leadId);

  revalidatePath("/dashboard");
}

export async function deleteLead(leadId: string) {
  const supabase = createClient();
  const { data: lead } = await supabase.from("leads").select("tenant_id, name, email").eq("id", leadId).maybeSingle();
  await supabase.from("leads").delete().eq("id", leadId);
  revalidatePath("/dashboard");
  if (lead) {
    const { data: userData } = await supabase.auth.getUser();
    await logAudit({
      tenantId: lead.tenant_id,
      userId: userData.user?.id,
      action: "lead.deleted",
      entityType: "lead",
      entityId: leadId,
      summary: `Deleted lead ${lead.name ?? lead.email ?? "(unnamed)"}`,
    });
  }
}

export async function bulkDeleteLeads(leadIds: string[], tenantId: string) {
  if (leadIds.length === 0) return;
  const supabase = createClient();
  await supabase.from("leads").delete().in("id", leadIds).eq("tenant_id", tenantId);
  revalidatePath("/dashboard");
  const { data: userData } = await supabase.auth.getUser();
  await logAudit({
    tenantId,
    userId: userData.user?.id,
    action: "lead.bulk_deleted",
    entityType: "lead",
    summary: `Deleted ${leadIds.length} lead${leadIds.length === 1 ? "" : "s"}`,
  });
}

// Lead value is owner-entered (the website form has no reason to ask a
// visitor to price their own job) - null clears it rather than storing 0,
// so an unpriced lead reads as "not estimated yet" instead of "worth £0"
// in the pipeline-value total.
export async function updateLeadValue(leadId: string, valuePounds: number | null) {
  const supabase = createClient();
  const value_pence =
    valuePounds !== null && Number.isFinite(valuePounds) && valuePounds >= 0
      ? Math.round(valuePounds * 100)
      : null;
  await supabase.from("leads").update({ value_pence }).eq("id", leadId);
  revalidatePath("/dashboard");
}

export async function updateLeadDetails(leadId: string, formData: FormData) {
  const supabase = createClient();
  await supabase
    .from("leads")
    .update({
      address: String(formData.get("address") ?? "").trim() || null,
      job_type: String(formData.get("jobType") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
    })
    .eq("id", leadId);

  revalidatePath("/dashboard");
}

// Converts a won lead into a project (and a matching customer record),
// carrying over name/value instead of re-typing them by hand. RLS on
// customers/projects/leads (not the tenantId argument) is what actually
// stops this creating or reading rows in a tenant the signed-in user isn't
// a member of - the lead.tenant_id check below just guards against a
// mismatched id being passed in from a stale client.
export async function convertLeadToProject(leadId: string, tenantId: string) {
  const supabase = createClient();

  const { data: lead } = await supabase
    .from("leads")
    .select("id, name, email, phone, value_pence, tenant_id")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead || lead.tenant_id !== tenantId) return;

  const clientName = lead.name?.trim() || lead.email?.trim() || "Unnamed lead";
  const customerId = await findOrCreateCustomer(supabase, tenantId, clientName, lead.email, lead.phone);

  await supabase.from("projects").insert({
    tenant_id: tenantId,
    ref: generateRef(),
    client_name: clientName,
    lead_id: lead.id,
    customer_id: customerId,
    value_pence: lead.value_pence,
    stage: "Enquiry",
    status: "on_track",
  });

  await supabase
    .from("leads")
    .update({ status: "won", status_updated_at: new Date().toISOString() })
    .eq("id", leadId);

  revalidatePath("/dashboard");
}

const VALID_QUOTE_STATUSES = ["draft", "sent", "accepted", "declined"];

// Line items are stored as-typed (owner controls both sides), so this only
// guards shape/type, not authenticity - RLS is still what stops a cross-tenant
// write.
export async function addQuote(formData: FormData) {
  const tenantId = String(formData.get("tenantId") ?? "");
  const clientName = String(formData.get("clientName") ?? "").trim();
  if (!tenantId || !clientName) return;

  const reference = String(formData.get("reference") ?? "").trim();
  const customerEmail = String(formData.get("customerEmail") ?? "").trim();
  const customerPhone = String(formData.get("customerPhone") ?? "").trim();
  const expiresAt = String(formData.get("expiresAt") ?? "").trim();
  const paymentTerms = String(formData.get("paymentTerms") ?? "").trim();
  const exclusions = String(formData.get("exclusions") ?? "").trim();
  const terms = String(formData.get("terms") ?? "").trim();
  const markupPercent = Number(formData.get("markupPercent") ?? 0) || 0;
  const vatRate = Number(formData.get("vatRate") ?? 20) || 0;
  const depositPounds = formData.get("deposit");

  const lineItems = parseLineItems(String(formData.get("lineItems") ?? "[]"));
  const { costSubtotalPence, vatAmountPence, totalPence } = computeQuoteTotals(lineItems, markupPercent, vatRate);

  const insert: Record<string, unknown> = {
    tenant_id: tenantId,
    quote_number: await nextQuoteNumber(tenantId),
    client_name: clientName,
    reference: reference || null,
    customer_email: customerEmail || null,
    customer_phone: customerPhone || null,
    expires_at: expiresAt || null,
    payment_terms: paymentTerms || null,
    exclusions: exclusions || null,
    terms: terms || null,
    markup_percent: markupPercent,
    vat_rate: vatRate,
    line_items: lineItems,
    cost_subtotal_pence: costSubtotalPence,
    vat_amount_pence: vatAmountPence,
    total_pence: totalPence,
    status: "draft",
  };
  if (depositPounds !== null && String(depositPounds).trim() !== "") {
    const pounds = Number(depositPounds);
    if (Number.isFinite(pounds) && pounds >= 0) insert.deposit_pence = Math.round(pounds * 100);
  }

  const supabase = createClient();
  await supabase.from("quotes").insert(insert);

  revalidatePath("/dashboard");
}

// updated_at plus a status-specific timestamp (sent_at/accepted_at/
// declined_at) - each is set once, the first time a quote reaches that
// status, so re-sending a quote doesn't silently move an earlier
// acceptance's timestamp.
export async function updateQuoteStatus(quoteId: string, status: string) {
  if (!VALID_QUOTE_STATUSES.includes(status)) return;
  const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === "sent") update.sent_at = new Date().toISOString();
  if (status === "accepted") update.accepted_at = new Date().toISOString();
  if (status === "declined") update.declined_at = new Date().toISOString();

  const supabase = createClient();
  await supabase.from("quotes").update(update).eq("id", quoteId);
  revalidatePath("/dashboard");
}

export async function deleteQuote(quoteId: string) {
  const supabase = createClient();
  const { data: quote } = await supabase
    .from("quotes")
    .select("tenant_id, client_name, total_pence")
    .eq("id", quoteId)
    .maybeSingle();
  await supabase.from("quotes").delete().eq("id", quoteId);
  revalidatePath("/dashboard");
  if (quote) {
    const { data: userData } = await supabase.auth.getUser();
    await logAudit({
      tenantId: quote.tenant_id,
      userId: userData.user?.id,
      action: "quote.deleted",
      entityType: "quote",
      entityId: quoteId,
      summary: `Deleted ${quote.client_name}'s quote (${formatGBP(quote.total_pence)})`,
    });
  }
}

export async function bulkDeleteQuotes(quoteIds: string[], tenantId: string) {
  if (quoteIds.length === 0) return;
  const supabase = createClient();
  await supabase.from("quotes").delete().in("id", quoteIds).eq("tenant_id", tenantId);
  revalidatePath("/dashboard");
  const { data: userData } = await supabase.auth.getUser();
  await logAudit({
    tenantId,
    userId: userData.user?.id,
    action: "quote.bulk_deleted",
    entityType: "quote",
    summary: `Deleted ${quoteIds.length} quote${quoteIds.length === 1 ? "" : "s"}`,
  });
}

// Emails the customer a link to the public accept/decline page
// (app/quote/[id]/[token]) - the token itself is what gates access there,
// not auth, so this is safe to send to anyone. Falls back through
// quote.customer_email -> the originating lead's email -> the linked
// customer's email, since a quote built straight from a lead often never
// had its own email typed in separately.
export async function sendQuote(quoteId: string, tenantId: string) {
  const supabase = createClient();

  const { data: quote } = await supabase
    .from("quotes")
    .select("id, tenant_id, client_name, quote_number, total_pence, accept_token, customer_email, lead_id, customer_id")
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote || quote.tenant_id !== tenantId) return;

  let recipient = quote.customer_email;
  if (!recipient && quote.lead_id) {
    const { data: lead } = await supabase.from("leads").select("email").eq("id", quote.lead_id).maybeSingle();
    recipient = lead?.email ?? null;
  }
  if (!recipient && quote.customer_id) {
    const { data: customer } = await supabase.from("customers").select("email").eq("id", quote.customer_id).maybeSingle();
    recipient = customer?.email ?? null;
  }

  const { data: tenant } = await supabase
    .from("tenants")
    .select("business_name, domain, contact_email")
    .eq("id", tenantId)
    .maybeSingle();
  const businessName = tenant?.business_name ?? "your contractor";
  const origin = tenant?.domain ? `https://${tenant.domain}` : "https://scalardigital.co.uk";
  const acceptUrl = `${origin}/quote/${quote.id}/${quote.accept_token}`;

  if (recipient) {
    await sendEmail({
      to: [recipient],
      subject: `Your quote from ${businessName}${quote.quote_number ? ` (${quote.quote_number})` : ""}`,
      html: `
        <p>Hi ${quote.client_name},</p>
        <p>${businessName} has sent you a quote${quote.total_pence ? ` for ${formatGBP(quote.total_pence)}` : ""}.</p>
        <p><a href="${acceptUrl}">View and respond to your quote</a></p>
      `,
      // Sends from Scalar's own domain either way - this just makes a reply
      // land in the tenant's own inbox instead of Scalar's, when they've set
      // one.
      replyTo: tenant?.contact_email ?? undefined,
    });
  }

  await supabase.from("quotes").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", quoteId);
  revalidatePath("/dashboard");
}

// Same conversion shape as convertLeadToProject, just sourced from a quote's
// total instead of a lead's estimated value - and it chains back to mark the
// originating lead "won" too, if this quote came from one.
export async function convertQuoteToProject(quoteId: string, tenantId: string) {
  const supabase = createClient();

  const { data: quote } = await supabase
    .from("quotes")
    .select("id, client_name, total_pence, lead_id, customer_email, customer_phone, tenant_id")
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote || quote.tenant_id !== tenantId) return;

  let leadEmail: string | null = quote.customer_email;
  let leadPhone: string | null = quote.customer_phone;
  if (!leadEmail && quote.lead_id) {
    const { data: lead } = await supabase
      .from("leads")
      .select("email, phone")
      .eq("id", quote.lead_id)
      .maybeSingle();
    leadEmail = lead?.email ?? null;
    leadPhone = lead?.phone ?? null;
  }
  const customerId = await findOrCreateCustomer(supabase, tenantId, quote.client_name, leadEmail, leadPhone);

  await supabase.from("projects").insert({
    tenant_id: tenantId,
    ref: generateRef(),
    client_name: quote.client_name,
    quote_id: quote.id,
    lead_id: quote.lead_id,
    customer_id: customerId,
    value_pence: quote.total_pence,
    stage: "Enquiry",
    status: "on_track",
  });

  if (quote.lead_id) {
    await supabase
      .from("leads")
      .update({ status: "won", status_updated_at: new Date().toISOString() })
      .eq("id", quote.lead_id);
  }

  revalidatePath("/dashboard");
}

// Manual creation - for a customer who never came through a lead/quote
// conversion (an old job entered by hand, a walk-in). Conversion still
// remains the normal path; this just covers the gap.
export async function addCustomer(formData: FormData) {
  const tenantId = String(formData.get("tenantId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!tenantId || !name) return;

  await createClient()
    .from("customers")
    .insert({
      tenant_id: tenantId,
      name,
      email: String(formData.get("email") ?? "").trim() || null,
      phone: String(formData.get("phone") ?? "").trim() || null,
      address: String(formData.get("address") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
    });

  revalidatePath("/customers");
}

export async function updateCustomer(customerId: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const supabase = createClient();
  await supabase
    .from("customers")
    .update({
      name,
      email: String(formData.get("email") ?? "").trim() || null,
      phone: String(formData.get("phone") ?? "").trim() || null,
      address: String(formData.get("address") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", customerId);

  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
}
