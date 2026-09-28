import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";

// Asks finished customers for a Google review - the thing that most moves a
// trade up the map results, and the thing nobody remembers to do on a Friday
// afternoon. Ask 1 goes 2 days after the job is marked complete (long enough
// for the dust to settle, soon enough that they still care); ask 2 goes 7 days
// after that; never a third. Only for businesses that turned it on (migration
// 045) and saved their Google review link, only for reviews still
// "requested", and only for jobs completed in the last 30 days - so switching
// it on doesn't email every customer from last year. Runs daily from the
// calendar-sync cron.

const FIRST_AFTER_DAYS = 2;
const SECOND_AFTER_DAYS = 7;
const MAX_ASKS = 2;
const RECENT_DAYS = 30;
const DAY = 86_400_000;

export type AskReview = {
  status: string;
  ask_count: number;
  last_asked_at: string | null;
};

/** Whether this review is due an ask now. Pure, so the rules are tested in one place. */
export function dueForReviewAsk(review: AskReview, completedAt: string | null, now: number): boolean {
  if (review.status !== "requested" || !completedAt) return false;
  if (review.ask_count >= MAX_ASKS) return false;
  const sinceCompleted = now - Date.parse(completedAt);
  if (review.ask_count === 0) return sinceCompleted >= FIRST_AFTER_DAYS * DAY && sinceCompleted <= RECENT_DAYS * DAY;
  return !!review.last_asked_at && now - Date.parse(review.last_asked_at) >= SECOND_AFTER_DAYS * DAY;
}

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The customer's email for a project: their customer record, else the lead, else the quote. */
export async function reviewRecipient(
  client: SupabaseClient,
  project: { customer_id: string | null; lead_id: string | null; quote_id: string | null } | null
): Promise<string | null> {
  if (project?.customer_id) {
    const { data } = await client.from("customers").select("email").eq("id", project.customer_id).maybeSingle();
    if (data?.email) return data.email;
  }
  if (project?.lead_id) {
    const { data } = await client.from("leads").select("email").eq("id", project.lead_id).maybeSingle();
    if (data?.email) return data.email;
  }
  if (project?.quote_id) {
    const { data } = await client.from("quotes").select("customer_email").eq("id", project.quote_id).maybeSingle();
    if (data?.customer_email) return data.customer_email;
  }
  return null;
}

/** The email itself - the first ask, or the one gentle reminder. */
export function reviewEmail(customerName: string, businessName: string, reviewUrl: string, reminder: boolean) {
  const name = escapeHtml(customerName);
  const business = escapeHtml(businessName);
  const link = escapeHtml(reviewUrl);
  return reminder
    ? {
        subject: `A quick favour? - ${businessName}`,
        html: `<p>Hi ${name},</p>
          <p>Sorry to nudge - if you were happy with the work, a couple of lines on Google helps a small business like ours more than anything else.</p>
          <p><a href="${link}">Leave us a Google review</a></p>
          <p>If anything wasn't right, just reply to this email and we'll put it right.</p>
          <p>${business}</p>`,
      }
    : {
        subject: `How did we do, ${customerName}?`,
        html: `<p>Hi ${name},</p>
          <p>Your job with ${business} is finished - thanks for choosing us.</p>
          <p>If you have a minute, a review would mean a lot: <a href="${link}">Leave us a Google review</a></p>
          <p>If anything isn't right, just reply to this email.</p>
          <p>${business}</p>`,
      };
}

export async function sendReviewRequests(): Promise<{ checked: number; sent: number }> {
  const admin = createAdminClient();
  const { data: tenants } = await admin
    .from("tenants")
    .select("id, business_name, contact_email, google_review_url")
    .eq("auto_review_requests", true)
    .not("google_review_url", "is", null);
  if (!tenants || tenants.length === 0) return { checked: 0, sent: 0 };

  const { data: reviews } = await admin
    .from("reviews")
    .select("id, tenant_id, project_id, customer_name, status, ask_count, last_asked_at")
    .in("tenant_id", tenants.map((t) => t.id))
    .eq("status", "requested")
    .lt("ask_count", MAX_ASKS)
    .not("project_id", "is", null);
  if (!reviews || reviews.length === 0) return { checked: 0, sent: 0 };

  const { data: projects } = await admin
    .from("projects")
    .select("id, completed_at, customer_id, lead_id, quote_id")
    .in("id", reviews.map((r) => r.project_id));
  const projectById = new Map((projects ?? []).map((p) => [p.id, p]));

  const now = Date.now();
  const due = reviews.filter((r) => dueForReviewAsk(r, projectById.get(r.project_id)?.completed_at ?? null, now));

  let sent = 0;
  for (const review of due) {
    const tenant = tenants.find((t) => t.id === review.tenant_id)!;
    try {
      const recipient = await reviewRecipient(admin, projectById.get(review.project_id) ?? null);
      if (!recipient) continue;
      const reminder = review.ask_count > 0;
      await sendEmail({
        to: [recipient],
        ...reviewEmail(review.customer_name, tenant.business_name, tenant.google_review_url!, reminder),
        replyTo: tenant.contact_email ?? undefined,
      });
      await admin
        .from("reviews")
        .update({ ask_count: review.ask_count + 1, last_asked_at: new Date().toISOString() })
        .eq("id", review.id);
      await admin.from("communications").insert({
        tenant_id: review.tenant_id,
        project_id: review.project_id,
        type: "email",
        summary: reminder ? "Review reminder emailed to customer (automatic)" : "Review request emailed to customer (automatic)",
      });
      sent++;
    } catch (err) {
      console.error(`Review request failed for review ${review.id}:`, err);
      Sentry.captureException(err);
    }
  }
  return { checked: due.length, sent };
}
