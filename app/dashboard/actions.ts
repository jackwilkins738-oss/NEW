"use server";

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCalendarConnection, getValidAccessToken } from "@/lib/calendarConnection";
import { upsertEvent, deleteEvent } from "@/lib/googleCalendar";

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

export async function deleteLead(leadId: string) {
  const supabase = createClient();
  await supabase.from("leads").delete().eq("id", leadId);
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

export async function deleteInvoice(invoiceId: string) {
  const supabase = createClient();
  await supabase.from("invoices").delete().eq("id", invoiceId);
  revalidatePath("/dashboard");
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
