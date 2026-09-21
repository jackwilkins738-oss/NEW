"use server";

// Delivering the job itself: the project record and everything attached to
// it - variations, snags, photos, documents, trade capacity, and the Google
// Calendar sync for site visits.
//
// Split out of the single 1,576-line app/actions.ts; app/actions.ts is now
// a barrel that re-exports this, so import sites are unchanged.

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCalendarConnection, getValidAccessToken } from "@/lib/calendarConnection";
import { upsertEvent, deleteEvent } from "@/lib/googleCalendar";
import { formatGBP } from "@/lib/format";
import { logAudit } from "@/lib/auditLog";
import { generateRef } from "@/lib/projectRef";

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

const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;

const VALID_PROJECT_STATUSES = ["on_track", "at_risk", "delayed", "awaiting_decision"];

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

  const { data: projectForLog } = await supabase
    .from("projects")
    .select("tenant_id, client_name, value_pence")
    .eq("id", projectId)
    .maybeSingle();

  await supabase.from("projects").delete().eq("id", projectId);
  revalidatePath("/dashboard");

  if (projectForLog) {
    const { data: userData } = await supabase.auth.getUser();
    await logAudit({
      tenantId: projectForLog.tenant_id,
      userId: userData.user?.id,
      action: "project.deleted",
      entityType: "project",
      entityId: projectId,
      summary: `Deleted project ${projectForLog.client_name}${
        projectForLog.value_pence != null ? ` (${formatGBP(projectForLog.value_pence)})` : ""
      }`,
    });
  }
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

  const { data: userData } = await supabase.auth.getUser();
  await logAudit({
    tenantId,
    userId: userData.user?.id,
    action: "project.completed",
    entityType: "project",
    entityId: projectId,
    summary: `Marked ${project.client_name} as complete`,
  });
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

  const { data: userData } = await supabase.auth.getUser();
  await logAudit({
    tenantId: variation.tenant_id,
    userId: userData.user?.id,
    action: "variation.approved",
    entityType: "variation",
    entityId: variationId,
    summary: `Approved ${variation.number ?? "a variation"} (${formatGBP(variation.customer_price_pence)})`,
  });
}

export async function declineVariation(projectId: string, variationId: string) {
  const supabase = createClient();
  const { data: variation } = await supabase
    .from("variations")
    .select("tenant_id, number, customer_price_pence")
    .eq("id", variationId)
    .maybeSingle();
  await supabase.from("variations").update({ status: "declined" }).eq("id", variationId);
  revalidatePath(`/projects/${projectId}`);
  if (variation) {
    const { data: userData } = await supabase.auth.getUser();
    await logAudit({
      tenantId: variation.tenant_id,
      userId: userData.user?.id,
      action: "variation.declined",
      entityType: "variation",
      entityId: variationId,
      summary: `Declined ${variation.number ?? "a variation"} (${formatGBP(variation.customer_price_pence)})`,
    });
  }
}

export async function deleteVariation(projectId: string, variationId: string) {
  const supabase = createClient();
  const { data: variation } = await supabase
    .from("variations")
    .select("tenant_id, number, customer_price_pence")
    .eq("id", variationId)
    .maybeSingle();
  await supabase.from("variations").delete().eq("id", variationId);
  revalidatePath(`/projects/${projectId}`);
  if (variation) {
    const { data: userData } = await supabase.auth.getUser();
    await logAudit({
      tenantId: variation.tenant_id,
      userId: userData.user?.id,
      action: "variation.deleted",
      entityType: "variation",
      entityId: variationId,
      summary: `Deleted ${variation.number ?? "a variation"} (${formatGBP(variation.customer_price_pence)})`,
    });
  }
}

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
