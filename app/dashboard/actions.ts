"use server";

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCalendarConnection, getValidAccessToken } from "@/lib/calendarConnection";
import { upsertEvent, deleteEvent } from "@/lib/googleCalendar";
import { sendEmail } from "@/lib/email";
import { formatGBP } from "@/lib/format";
import { todayInUK } from "@/lib/ukDate";
import { parseLineItems, computeQuoteTotals } from "@/lib/quoteMath";

// Best-effort, mirroring the notifyNewLead pattern in app/api/leads/route.ts:
// a Google API hiccup should never stop a project save/delete from working,
// it should just not sync that one time. `supabase` here is the caller's own
// session-scoped client so the google_event_id write-back respects the same
// RLS as everything else in this file.
async function syncNextVisitToCalendar(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  clientName: string,
  nextVisitAt: string | null
) {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const connection = await getCalendarConnection(userData.user.id);
    if (!connection) return;

    const { data: project } = await supabase
      .from("projects")
      .select("google_event_id")
      .eq("id", projectId)
      .maybeSingle();
    const existingEventId = project?.google_event_id ?? null;
    const accessToken = await getValidAccessToken(connection);

    if (nextVisitAt) {
      const googleEventId = await upsertEvent(accessToken, connection.google_calendar_id, existingEventId, {
        summary: `Site visit - ${clientName}`,
        startIso: nextVisitAt,
      });
      if (googleEventId !== existingEventId) {
        await supabase.from("projects").update({ google_event_id: googleEventId }).eq("id", projectId);
      }
    } else if (existingEventId) {
      await deleteEvent(accessToken, connection.google_calendar_id, existingEventId);
      await supabase.from("projects").update({ google_event_id: null }).eq("id", projectId);
    }
  } catch (err) {
    console.error("Calendar sync failed:", err);
    Sentry.captureException(err);
  }
}

export async function disconnectGoogleCalendar() {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return;

  // calendar_connections has no RLS policies (see supabase/migrations/011) -
  // has to go through the admin client even for the user's own row.
  const admin = createAdminClient();
  await admin.from("calendar_connections").delete().eq("user_id", userData.user.id);
  revalidatePath("/dashboard");
}

const VALID_STATUSES = ["new", "contacted", "survey_booked", "quoted", "won", "lost"];

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
  await supabase.from("leads").delete().eq("id", leadId);
  revalidatePath("/dashboard");
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
  const { data: invoice } = await supabase.from("invoices").select("amount_pence, project_id").eq("id", invoiceId).maybeSingle();
  await supabase.from("invoices").update({ status: "paid", paid_pence: invoice?.amount_pence ?? 0 }).eq("id", invoiceId);
  revalidatePath("/dashboard");
  if (invoice?.project_id) revalidatePath(`/projects/${invoice.project_id}`);
}

// Supports part-payment: paid_pence accumulates, status becomes "paid" once
// it reaches the full amount and "part_paid" otherwise - due/overdue stay
// computed from due_date wherever they're shown, unaffected by this.
export async function recordInvoicePayment(invoiceId: string, amountPounds: number) {
  if (!Number.isFinite(amountPounds) || amountPounds <= 0) return;

  const supabase = createClient();
  const { data: invoice } = await supabase
    .from("invoices")
    .select("amount_pence, paid_pence, project_id")
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
}

export async function deleteInvoice(invoiceId: string) {
  const supabase = createClient();
  await supabase.from("invoices").delete().eq("id", invoiceId);
  revalidatePath("/dashboard");
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

function generateRef() {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `P-${stamp}-${suffix}`;
}

// Same trust model as addInvoice: RLS checks the signed-in user's own
// membership against the tenant_id in the row, not against whatever the
// client happened to send.
export async function addProject(formData: FormData) {
  const tenantId = String(formData.get("tenantId") ?? "");
  const clientName = String(formData.get("clientName") ?? "").trim();
  if (!tenantId || !clientName) return;

  const valuePounds = formData.get("value");
  const insert: Record<string, unknown> = {
    tenant_id: tenantId,
    ref: generateRef(),
    client_name: clientName,
    location: String(formData.get("location") ?? "").trim() || null,
    project_type: String(formData.get("projectType") ?? "").trim() || null,
    stage: "Enquiry",
    target_date: String(formData.get("targetDate") ?? "") || null,
    status: "on_track",
  };

  if (valuePounds !== null && String(valuePounds).trim() !== "") {
    const pounds = Number(valuePounds);
    if (Number.isFinite(pounds) && pounds >= 0) insert.value_pence = Math.round(pounds * 100);
  }

  const supabase = createClient();
  await supabase.from("projects").insert(insert);

  revalidatePath("/dashboard");
}

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

async function nextInvoiceNumber(tenantId: string): Promise<string> {
  const admin = createAdminClient();
  const { data: tenant } = await admin.from("tenants").select("invoice_number_prefix").eq("id", tenantId).maybeSingle();
  const { data: n } = await admin.rpc("increment_invoice_number", { p_tenant_id: tenantId });
  return `${tenant?.invoice_number_prefix ?? "INV"}-${String(n ?? 1).padStart(4, "0")}`;
}

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
  await supabase.from("quotes").delete().eq("id", quoteId);
  revalidatePath("/dashboard");
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

const VALID_PROJECT_STATUSES = ["on_track", "at_risk", "delayed", "awaiting_decision"];

// RLS ("member can manage own projects") is the real security boundary here
// too - the .eq("id", projectId) below only narrows which row the update
// targets, it isn't what stops cross-tenant edits.
export async function updateProject(projectId: string, formData: FormData) {
  const clientName = String(formData.get("clientName") ?? "").trim();
  if (!clientName) return;

  const status = String(formData.get("status") ?? "on_track");
  const valuePounds = formData.get("value");
  const nextVisitDate = String(formData.get("nextVisitDate") ?? "");
  const nextVisitTime = String(formData.get("nextVisitTime") ?? "");

  const update: Record<string, unknown> = {
    client_name: clientName,
    location: String(formData.get("location") ?? "").trim() || null,
    project_type: String(formData.get("projectType") ?? "").trim() || null,
    stage: String(formData.get("stage") ?? "").trim() || null,
    pm: String(formData.get("pm") ?? "").trim() || null,
    start_date: String(formData.get("startDate") ?? "") || null,
    target_date: String(formData.get("targetDate") ?? "") || null,
    payment_type: String(formData.get("paymentType") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
    status: VALID_PROJECT_STATUSES.includes(status) ? status : "on_track",
    updated_at: new Date().toISOString(),
  };

  if (valuePounds !== null && String(valuePounds).trim() !== "") {
    const pounds = Number(valuePounds);
    if (Number.isFinite(pounds) && pounds >= 0) update.value_pence = Math.round(pounds * 100);
  }

  const nextVisitAt = nextVisitDate ? new Date(`${nextVisitDate}T${nextVisitTime || "09:00"}`).toISOString() : null;
  update.next_visit_at = nextVisitAt;

  const supabase = createClient();
  await supabase.from("projects").update(update).eq("id", projectId);
  await syncNextVisitToCalendar(supabase, projectId, clientName, nextVisitAt);

  revalidatePath("/dashboard");
}

export async function deleteProject(projectId: string) {
  const supabase = createClient();

  // Clean up the synced calendar event, if any, before the project row
  // (and its google_event_id with it) disappears.
  try {
    const { data: userData } = await supabase.auth.getUser();
    const { data: project } = await supabase
      .from("projects")
      .select("google_event_id")
      .eq("id", projectId)
      .maybeSingle();
    if (userData.user && project?.google_event_id) {
      const connection = await getCalendarConnection(userData.user.id);
      if (connection) {
        const accessToken = await getValidAccessToken(connection);
        await deleteEvent(accessToken, connection.google_calendar_id, project.google_event_id);
      }
    }
  } catch (err) {
    console.error("Calendar cleanup failed:", err);
    Sentry.captureException(err);
  }

  await supabase.from("projects").delete().eq("id", projectId);
  revalidatePath("/dashboard");
}

// Upsert on (tenant_id, trade_name): adding a trade that already exists
// just updates its percentage instead of erroring, so the form doubles as
// both "add" and "update" without needing separate code paths.
export async function setTradeCapacity(formData: FormData) {
  const tenantId = String(formData.get("tenantId") ?? "");
  const tradeName = String(formData.get("tradeName") ?? "").trim();
  const percentBooked = Number(formData.get("percentBooked"));
  if (!tenantId || !tradeName || !Number.isFinite(percentBooked)) return;

  const clamped = Math.max(0, Math.min(100, Math.round(percentBooked)));
  const supabase = createClient();
  await supabase
    .from("trade_capacity")
    .upsert(
      { tenant_id: tenantId, trade_name: tradeName, percent_booked: clamped, updated_at: new Date().toISOString() },
      { onConflict: "tenant_id,trade_name" }
    );

  revalidatePath("/dashboard");
}

export async function deleteTradeCapacity(id: string) {
  const supabase = createClient();
  await supabase.from("trade_capacity").delete().eq("id", id);
  revalidatePath("/dashboard");
}

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];

// Storage RLS ("member can upload own tenant photos", supabase/migrations/012)
// is the real security boundary - it only allows a write under a path whose
// first segment matches a tenant_id the signed-in user has a membership for,
// so the tenantId field in the form isn't trusted on its own.
export async function uploadProjectPhoto(formData: FormData) {
  const tenantId = String(formData.get("tenantId") ?? "");
  const projectId = String(formData.get("projectId") ?? "").trim();
  const caption = String(formData.get("caption") ?? "").trim();
  const file = formData.get("photo");

  if (!tenantId || !(file instanceof File) || file.size === 0) return;
  if (file.size > MAX_PHOTO_BYTES) return;
  if (!ALLOWED_PHOTO_TYPES.includes(file.type)) return;

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : file.type === "image/heic" ? "heic" : "jpg";
  const path = `${tenantId}/${crypto.randomUUID()}.${ext}`;

  const supabase = createClient();
  const { error: uploadError } = await supabase.storage.from("project-photos").upload(path, file, {
    contentType: file.type,
    cacheControl: "31536000",
  });
  if (uploadError) return;

  await supabase.from("project_photos").insert({
    tenant_id: tenantId,
    project_id: projectId || null,
    storage_path: path,
    caption: caption || null,
  });

  revalidatePath("/dashboard");
}

export async function deleteProjectPhoto(photoId: string, storagePath: string) {
  const supabase = createClient();
  await supabase.storage.from("project-photos").remove([storagePath]);
  await supabase.from("project_photos").delete().eq("id", photoId);
  revalidatePath("/dashboard");
}

const COST_CATEGORIES = ["materials", "labour", "subcontractors", "plant", "other"];

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

// Sequential per project ("Variation #003"), not a global counter - counted
// at insert time rather than stored as a running number on the project,
// since variations are rare enough that a duplicate-on-race is very
// unlikely and not worth a second table to prevent.
export async function addVariation(formData: FormData) {
  const tenantId = String(formData.get("tenantId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  if (!tenantId || !projectId || !description) return;

  const supabase = createClient();
  const { count } = await supabase
    .from("variations")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);
  const number = `V-${String((count ?? 0) + 1).padStart(3, "0")}`;

  const toPence = (field: string) => {
    const pounds = Number(formData.get(field) ?? 0);
    return Number.isFinite(pounds) && pounds >= 0 ? Math.round(pounds * 100) : 0;
  };
  const additionalDaysRaw = formData.get("additionalDays");
  const additionalDays = additionalDaysRaw !== null && String(additionalDaysRaw).trim() !== "" ? Number(additionalDaysRaw) : null;

  await supabase.from("variations").insert({
    tenant_id: tenantId,
    project_id: projectId,
    number,
    description,
    materials_cost_pence: toPence("materialsCost"),
    labour_cost_pence: toPence("labourCost"),
    other_cost_pence: toPence("otherCost"),
    customer_price_pence: toPence("customerPrice"),
    additional_days: Number.isFinite(additionalDays) ? additionalDays : null,
    status: "pending",
  });

  revalidatePath(`/projects/${projectId}`);
}

// Approving does two things: adds the variation's customer_price_pence onto
// the project's own value (this is what "the job is now worth more" means
// in practice), and logs its cost breakdown into the same cost ledger every
// other project cost goes through - a variation's materials/labour/other
// costs are real committed costs like any other, just triggered by a
// customer request instead of the original quote.
export async function approveVariation(projectId: string, variationId: string) {
  const supabase = createClient();

  const { data: variation } = await supabase
    .from("variations")
    .select("id, tenant_id, project_id, number, description, materials_cost_pence, labour_cost_pence, other_cost_pence, customer_price_pence, status")
    .eq("id", variationId)
    .maybeSingle();
  if (!variation || variation.status === "approved") return;

  await supabase.from("variations").update({ status: "approved", approved_at: new Date().toISOString() }).eq("id", variationId);

  const { data: project } = await supabase.from("projects").select("value_pence").eq("id", projectId).maybeSingle();
  await supabase
    .from("projects")
    .update({ value_pence: (project?.value_pence ?? 0) + variation.customer_price_pence })
    .eq("id", projectId);

  const costLines: { category: string; amount: number }[] = [
    { category: "materials", amount: variation.materials_cost_pence },
    { category: "labour", amount: variation.labour_cost_pence },
    { category: "other", amount: variation.other_cost_pence },
  ].filter((l) => l.amount > 0);

  if (costLines.length > 0) {
    await supabase.from("project_cost_items").insert(
      costLines.map((l) => ({
        tenant_id: variation.tenant_id,
        project_id: projectId,
        category: l.category,
        description: `${variation.number ?? "Variation"}: ${variation.description}`,
        amount_pence: l.amount,
        status: "committed",
      }))
    );
  }

  revalidatePath(`/projects/${projectId}`);
}

export async function declineVariation(projectId: string, variationId: string) {
  const supabase = createClient();
  await supabase.from("variations").update({ status: "declined" }).eq("id", variationId);
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteVariation(projectId: string, variationId: string) {
  const supabase = createClient();
  await supabase.from("variations").delete().eq("id", variationId);
  revalidatePath(`/projects/${projectId}`);
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

const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;
const DOCUMENT_CATEGORIES = [
  "contract",
  "drawings",
  "plans",
  "rams",
  "certificate",
  "insurance",
  "purchase_order",
  "other",
];

// Storage RLS ("member can upload own tenant documents", migration 023) is
// the real security boundary - it only allows a write under a path whose
// first segment matches a tenant_id the signed-in user has a membership
// for. Unlike project photos, no MIME allowlist - a RAMS document or
// insurance certificate is as likely to be a Word doc as a PDF.
export async function uploadProjectDocument(formData: FormData) {
  const tenantId = String(formData.get("tenantId") ?? "");
  const projectId = String(formData.get("projectId") ?? "").trim();
  const category = String(formData.get("category") ?? "other");
  const file = formData.get("document");

  if (!tenantId || !(file instanceof File) || file.size === 0) return;
  if (file.size > MAX_DOCUMENT_BYTES) return;

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${tenantId}/${crypto.randomUUID()}-${safeName}`;

  const supabase = createClient();
  const { error: uploadError } = await supabase.storage.from("project-documents").upload(path, file, {
    contentType: file.type || "application/octet-stream",
  });
  if (uploadError) return;

  await supabase.from("project_documents").insert({
    tenant_id: tenantId,
    project_id: projectId || null,
    storage_path: path,
    filename: file.name,
    category: DOCUMENT_CATEGORIES.includes(category) ? category : "other",
  });

  if (projectId) revalidatePath(`/projects/${projectId}`);
}

export async function deleteProjectDocument(projectId: string, documentId: string, storagePath: string) {
  const supabase = createClient();
  await supabase.storage.from("project-documents").remove([storagePath]);
  await supabase.from("project_documents").delete().eq("id", documentId);
  if (projectId) revalidatePath(`/projects/${projectId}`);
}

const SNAG_STATUSES = ["open", "assigned", "complete"];

export async function addSnag(formData: FormData) {
  const tenantId = String(formData.get("tenantId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  if (!tenantId || !projectId || !description) return;

  await createClient()
    .from("snags")
    .insert({
      tenant_id: tenantId,
      project_id: projectId,
      description,
      location: String(formData.get("location") ?? "").trim() || null,
      assigned_to: String(formData.get("assignedTo") ?? "").trim() || null,
      due_date: String(formData.get("dueDate") ?? "") || null,
      status: "open",
    });

  revalidatePath(`/projects/${projectId}`);
}

// projectId first, same reason as the cost-item actions - lets this be
// pre-bound with .bind(null, project.id) for DeleteButton.
export async function updateSnagStatus(projectId: string, snagId: string, status: string) {
  if (!SNAG_STATUSES.includes(status)) return;
  const supabase = createClient();
  await supabase.from("snags").update({ status }).eq("id", snagId);
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteSnag(projectId: string, snagId: string) {
  const supabase = createClient();
  await supabase.from("snags").delete().eq("id", snagId);
  revalidatePath(`/projects/${projectId}`);
}

export async function addTeamMember(formData: FormData) {
  const tenantId = String(formData.get("tenantId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!tenantId || !name) return;

  const costPerHourPounds = formData.get("costPerHour");
  const insert: Record<string, unknown> = {
    tenant_id: tenantId,
    name,
    role: String(formData.get("role") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
  };
  if (costPerHourPounds !== null && String(costPerHourPounds).trim() !== "") {
    const pounds = Number(costPerHourPounds);
    if (Number.isFinite(pounds) && pounds >= 0) insert.cost_per_hour_pence = Math.round(pounds * 100);
  }

  await createClient().from("team_members").insert(insert);
  revalidatePath("/team");
}

export async function deleteTeamMember(id: string) {
  const supabase = createClient();
  await supabase.from("team_members").delete().eq("id", id);
  revalidatePath("/team");
}

// RLS on project_team_members (migration 025) is what actually stops
// assigning someone to a project outside the caller's own tenant - it joins
// through projects -> memberships rather than trusting the ids passed in.
export async function assignTeamMemberToProject(projectId: string, teamMemberId: string) {
  const supabase = createClient();
  await supabase.from("project_team_members").upsert({ project_id: projectId, team_member_id: teamMemberId });
  revalidatePath(`/projects/${projectId}`);
}

export async function unassignTeamMemberFromProject(projectId: string, teamMemberId: string) {
  const supabase = createClient();
  await supabase
    .from("project_team_members")
    .delete()
    .eq("project_id", projectId)
    .eq("team_member_id", teamMemberId);
  revalidatePath(`/projects/${projectId}`);
}

export async function addSupplier(formData: FormData) {
  const tenantId = String(formData.get("tenantId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!tenantId || !name) return;

  await createClient()
    .from("suppliers")
    .insert({
      tenant_id: tenantId,
      name,
      contact_name: String(formData.get("contactName") ?? "").trim() || null,
      account_number: String(formData.get("accountNumber") ?? "").trim() || null,
      phone: String(formData.get("phone") ?? "").trim() || null,
      email: String(formData.get("email") ?? "").trim() || null,
      categories: String(formData.get("categories") ?? "").trim() || null,
    });

  revalidatePath("/suppliers");
}

export async function deleteSupplier(id: string) {
  const supabase = createClient();
  await supabase.from("suppliers").delete().eq("id", id);
  revalidatePath("/suppliers");
}

const COMMUNICATION_TYPES = ["email", "sms", "call", "note"];

export async function addCommunication(formData: FormData) {
  const tenantId = String(formData.get("tenantId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  const type = String(formData.get("type") ?? "note");
  const summary = String(formData.get("summary") ?? "").trim();
  if (!tenantId || !projectId || !summary) return;

  await createClient()
    .from("communications")
    .insert({
      tenant_id: tenantId,
      project_id: projectId,
      type: COMMUNICATION_TYPES.includes(type) ? type : "note",
      summary,
    });

  revalidatePath(`/projects/${projectId}`);
}

export async function deleteCommunication(projectId: string, id: string) {
  const supabase = createClient();
  await supabase.from("communications").delete().eq("id", id);
  revalidatePath(`/projects/${projectId}`);
}

export async function requestReview(formData: FormData) {
  const tenantId = String(formData.get("tenantId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  const customerName = String(formData.get("customerName") ?? "").trim();
  if (!tenantId || !projectId || !customerName) return;

  await createClient()
    .from("reviews")
    .insert({ tenant_id: tenantId, project_id: projectId, customer_name: customerName, status: "requested" });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/reviews");
}

// Records what the customer actually said, once they've said it -
// separate from requesting, since a request can sit unanswered for a
// while.
export async function recordReview(projectId: string, reviewId: string, formData: FormData) {
  const rating = Number(formData.get("rating") ?? 0);
  const reviewText = String(formData.get("reviewText") ?? "").trim();

  const supabase = createClient();
  await supabase
    .from("reviews")
    .update({
      status: "received",
      received_at: new Date().toISOString(),
      rating: Number.isFinite(rating) && rating >= 1 && rating <= 5 ? rating : null,
      review_text: reviewText || null,
    })
    .eq("id", reviewId);

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/reviews");
}

export async function togglePublishReview(projectId: string, reviewId: string, published: boolean) {
  const supabase = createClient();
  await supabase.from("reviews").update({ published }).eq("id", reviewId);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/reviews");
}

export async function deleteReview(projectId: string, reviewId: string) {
  const supabase = createClient();
  await supabase.from("reviews").delete().eq("id", reviewId);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/reviews");
}

// Marking a project complete does NOT email the customer by itself - it
// logs a pending review request (status "requested") and leaves it for
// Needs Attention to keep surfacing until someone actually sends it (via
// the "Send request" button on the review, or however they choose to ask).
// Guarded by completed_at already being set (idempotent - re-visiting an
// already-complete project doesn't create a duplicate) and by an existing
// review row for this project (covers requesting one by hand before
// marking it complete).
export async function markProjectComplete(projectId: string, tenantId: string) {
  const supabase = createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, tenant_id, client_name, completed_at")
    .eq("id", projectId)
    .maybeSingle();
  if (!project || project.tenant_id !== tenantId || project.completed_at) return;

  await supabase.from("projects").update({ completed_at: new Date().toISOString() }).eq("id", projectId);

  const { count: existingReviews } = await supabase
    .from("reviews")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);
  if ((existingReviews ?? 0) === 0) {
    await supabase.from("reviews").insert({
      tenant_id: tenantId,
      project_id: projectId,
      customer_name: project.client_name,
      status: "requested",
    });
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/reviews");
  revalidatePath("/dashboard");
}

// Manual, one click - the owner decides when to actually ask, this just
// makes it easy once they do. No-op if the tenant hasn't set a Google
// review link yet (Settings).
export async function sendReviewRequestEmail(
  projectId: string,
  tenantId: string,
  reviewId: string
): Promise<{ ok: boolean; reason?: "no_review_link" | "no_email" | "not_found" }> {
  const supabase = createClient();

  const { data: review } = await supabase
    .from("reviews")
    .select("id, tenant_id, project_id, customer_name")
    .eq("id", reviewId)
    .maybeSingle();
  if (!review || review.tenant_id !== tenantId) return { ok: false, reason: "not_found" };

  const { data: tenant } = await supabase
    .from("tenants")
    .select("business_name, google_review_url, contact_email")
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenant?.google_review_url) return { ok: false, reason: "no_review_link" };

  const { data: project } = await supabase
    .from("projects")
    .select("customer_id, lead_id, quote_id")
    .eq("id", projectId)
    .maybeSingle();

  let recipient: string | null = null;
  if (project?.customer_id) {
    const { data: customer } = await supabase.from("customers").select("email").eq("id", project.customer_id).maybeSingle();
    recipient = customer?.email ?? null;
  }
  if (!recipient && project?.lead_id) {
    const { data: lead } = await supabase.from("leads").select("email").eq("id", project.lead_id).maybeSingle();
    recipient = lead?.email ?? null;
  }
  if (!recipient && project?.quote_id) {
    const { data: quote } = await supabase.from("quotes").select("customer_email").eq("id", project.quote_id).maybeSingle();
    recipient = quote?.customer_email ?? null;
  }
  if (!recipient) return { ok: false, reason: "no_email" };

  await sendEmail({
    to: [recipient],
    subject: `How did we do, ${review.customer_name}?`,
    html: `
      <p>Hi ${review.customer_name},</p>
      <p>Your project with ${tenant.business_name} is complete - thanks for choosing us.</p>
      <p>If you have a minute, a review would mean a lot: <a href="${tenant.google_review_url}">Leave us a Google review</a></p>
    `,
    replyTo: tenant.contact_email ?? undefined,
  });

  await supabase.from("communications").insert({
    tenant_id: tenantId,
    project_id: projectId,
    type: "email",
    summary: "Review request emailed to customer",
  });

  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
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
