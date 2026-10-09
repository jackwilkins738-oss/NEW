import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { tenantOrigin } from "@/lib/tenantOrigin";
import { planIncludes } from "@/lib/plans";
import { accessToken, createLocalPost, listReviews, localPostBody, LOCATION, type GoogleReview } from "@/lib/googleBusiness";

// The automatic half of Google Business Profile (lib/googleBusiness.ts):
// approved job posts go up as Google updates, and each client's reviews come
// down daily, with an email when a new one needs a reply.

type Admin = ReturnType<typeof createAdminClient>;

/** Posts one published job post to the client's Google profile, if they're linked. Never throws - records the error instead. */
export async function postJobToGoogle(admin: Admin, tenantId: string, postId: string): Promise<"posted" | "skipped" | "failed"> {
  try {
    const { data: t } = await admin.from("tenants").select("plan, gbp_location").eq("id", tenantId).maybeSingle();
    if (!t?.gbp_location || !LOCATION.test(t.gbp_location) || !planIncludes(t.plan, "google_posts")) return "skipped";
    const { data: post } = await admin
      .from("job_posts")
      .select("id, title, google_post, page_url, photos, google_post_name")
      .eq("id", postId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!post || post.google_post_name) return "skipped";
    const token = await accessToken();
    if (!token) return "skipped";
    try {
      const name = await createLocalPost(token, t.gbp_location, localPostBody({ ...post, photos: (post.photos ?? []) as { url: string }[] }));
      await admin.from("job_posts").update({ google_post_name: name, google_posted_at: new Date().toISOString(), google_error: null }).eq("id", postId);
      return "posted";
    } catch (err) {
      await admin.from("job_posts").update({ google_error: String(err instanceof Error ? err.message : err).slice(0, 500) }).eq("id", postId);
      return "failed";
    }
  } catch (err) {
    // Before migration 068, or any other surprise: the post is still live on their site.
    Sentry.captureException(err);
    return "failed";
  }
}

const NEW_REVIEW_DAYS = 7;

/** Reviews that are new to us, recent, and not yet replied to - the ones worth an email. */
export function needsReplyAlert(fetched: GoogleReview[], known: Set<string>, now: number): GoogleReview[] {
  return fetched.filter(
    (r) => !known.has(r.review_name) && !r.reply && r.reviewed_at && now - Date.parse(r.reviewed_at) <= NEW_REVIEW_DAYS * 86_400_000
  );
}

export function newReviewEmail(businessName: string, reviews: GoogleReview[], reviewsUrl: string) {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  const first = reviews[0];
  const low = reviews.some((r) => (r.star_rating ?? 5) <= 3);
  return {
    subject:
      reviews.length === 1
        ? `New ${first.star_rating ?? ""}${first.star_rating ? "★ " : ""}Google review${first.reviewer ? ` from ${first.reviewer}` : ""}`
        : `${reviews.length} new Google reviews`,
    html: `<p>Hi ${esc(businessName)},</p>
      ${reviews
        .map(
          (r) => `<p><strong>${"★".repeat(r.star_rating ?? 0)}</strong> ${esc(r.reviewer ?? "A customer")}${
            r.comment ? `: &ldquo;${esc(r.comment.slice(0, 300))}${r.comment.length > 300 ? "..." : ""}&rdquo;` : ""
          }</p>`
        )
        .join("")}
      <p>${low ? "A quick, calm reply to a disappointed customer shows everyone else reading how you handle problems." : "Thanking people publicly is noticed by everyone reading your reviews."}
      A reply is written for you - check it and post it in one tap.</p>
      <p><a href="${esc(reviewsUrl)}">Reply now</a></p>
      <p>Scalar Digital</p>`,
  };
}

export async function syncGoogleReviews(): Promise<{ clients: number; reviews: number; alerts: number }> {
  const admin = createAdminClient();
  const { data: tenants, error } = await admin
    .from("tenants")
    .select("id, business_name, contact_email, domain, slug, plan, gbp_location")
    .not("gbp_location", "is", null);
  if (error || !tenants?.length) return { clients: 0, reviews: 0, alerts: 0 };
  const token = await accessToken();
  if (!token) return { clients: 0, reviews: 0, alerts: 0 };
  let reviews = 0;
  let alerts = 0;
  let clients = 0;
  for (const t of tenants) {
    if (!LOCATION.test(t.gbp_location ?? "") || !planIncludes(t.plan, "review_replies")) continue;
    try {
      const fetched = await listReviews(token, t.gbp_location!);
      const { data: existing } = await admin.from("google_reviews").select("review_name").eq("tenant_id", t.id);
      const known = new Set((existing ?? []).map((r) => r.review_name));
      if (fetched.length) {
        await admin
          .from("google_reviews")
          .upsert(fetched.map((r) => ({ ...r, tenant_id: t.id, fetched_at: new Date().toISOString() })), { onConflict: "review_name" });
      }
      clients++;
      reviews += fetched.length;
      // The first sync for a client only fills the list - no email about reviews they've already seen.
      const fresh = known.size ? needsReplyAlert(fetched, known, Date.now()) : [];
      if (fresh.length && t.contact_email) {
        await sendEmail({ to: [t.contact_email], ...newReviewEmail(t.business_name, fresh, `${tenantOrigin(t)}/reviews`) });
        alerts++;
      }
    } catch (err) {
      console.error(`Google reviews sync failed for tenant ${t.id}:`, err);
      Sentry.captureException(err);
    }
  }
  return { clients, reviews, alerts };
}
