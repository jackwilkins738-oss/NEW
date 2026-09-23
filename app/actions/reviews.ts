"use server";

// Asking for, recording and publishing customer reviews once a job is done.
//
// Split out of the single 1,576-line app/actions.ts; app/actions.ts is now
// a barrel that re-exports this, so import sites are unchanged.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";

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

  // contact_email isn't in the public tenant columns anon/authenticated can
  // select (see 039_restrict_tenant_columns.sql) - the review/tenantId match
  // above already confirms this tenant owns the review being actioned, so
  // the admin client here isn't widening access, just working around a
  // column grant that the session-scoped client can no longer see past.
  const { data: tenant } = await createAdminClient()
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
