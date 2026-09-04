"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const VALID_STATUSES = ["new", "contacted", "quoted", "won", "lost"];

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

// Accepting tenantId from the client form isn't a trust issue: the RLS
// policy on invoices (supabase/schema.sql) only allows the insert through
// if the signed-in user actually has a membership row for that tenant_id -
// someone can't invoice into a business they don't belong to just by
// editing the hidden field.
export async function addInvoice(formData: FormData) {
  const tenantId = String(formData.get("tenantId") ?? "");
  const clientName = String(formData.get("clientName") ?? "").trim();
  const reference = String(formData.get("reference") ?? "").trim();
  const amountPounds = Number(formData.get("amount"));
  const dueDate = String(formData.get("dueDate") ?? "");

  if (!tenantId || !clientName || !dueDate || !Number.isFinite(amountPounds) || amountPounds <= 0) {
    return;
  }

  const supabase = createClient();
  await supabase.from("invoices").insert({
    tenant_id: tenantId,
    client_name: clientName,
    reference: reference || null,
    amount_pence: Math.round(amountPounds * 100),
    due_date: dueDate,
    status: "unpaid",
  });

  revalidatePath("/dashboard");
}

export async function markInvoicePaid(invoiceId: string) {
  const supabase = createClient();
  await supabase.from("invoices").update({ status: "paid" }).eq("id", invoiceId);
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

  update.next_visit_at = nextVisitDate ? new Date(`${nextVisitDate}T${nextVisitTime || "09:00"}`).toISOString() : null;

  const supabase = createClient();
  await supabase.from("projects").update(update).eq("id", projectId);

  revalidatePath("/dashboard");
}
