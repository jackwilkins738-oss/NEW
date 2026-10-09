import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { brandThemeStyleTag } from "@/lib/theme";
import { DeleteButton } from "@/components/DeleteButton";
import { ReviewPublishToggle } from "@/components/ReviewPublishToggle";
import { ReviewSendRequestButton } from "@/components/ReviewSendRequestButton";
import { Stars } from "@/components/ReviewsPanel";
import { ReviewsSortSelect } from "@/components/ReviewsSortSelect";
import { deleteReview } from "@/app/dashboard/actions";
import { signOut } from "@/app/login/actions";
import { IconStar } from "@/components/DashboardIcons";
import { AppSidebar } from "@/components/AppSidebar";
import { getCurrentUserRole } from "@/lib/membershipRole";
import { createAdminClient } from "@/lib/supabase/admin";
import { planIncludes } from "@/lib/plans";
import { ReviewReplyDrafter } from "@/components/ReviewReplyDrafter";
import { GoogleReviewCard, type GoogleReviewView } from "@/components/GoogleReviewCard";

export const dynamic = "force-dynamic";

type SortKey = "newest" | "oldest" | "rating_high" | "rating_low" | "status";

export default async function ReviewsPage(props: { searchParams: Promise<{ sort?: string }> }) {
  const searchParams = await props.searchParams;
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/login");

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");
  const role = await getCurrentUserRole(supabase, tenant.id, userData.user.id);

  const [reviewsRes, projectsRes] = await Promise.all([
    supabase
      .from("reviews")
      .select("id, project_id, customer_name, rating, review_text, status, published, requested_at, received_at")
      .eq("tenant_id", tenant.id),
    supabase.from("projects").select("id, client_name, ref").eq("tenant_id", tenant.id),
  ]);

  // Review replies are Growth and up; the plan is read on its own (not among the default tenant columns).
  const { data: planRow } = await createAdminClient().from("tenants").select("plan").eq("id", tenant.id).maybeSingle();
  const canReply = planIncludes(planRow?.plan, "review_replies");
  // Their Google reviews, synced daily once they're linked (migration 068) - unanswered first.
  const { data: googleRows } = await supabase
    .from("google_reviews")
    .select("id, reviewer, star_rating, comment, reviewed_at, reply")
    .eq("tenant_id", tenant.id)
    .order("reviewed_at", { ascending: false })
    .limit(40);
  const googleReviews = [...((googleRows ?? []) as GoogleReviewView[])].sort((a, b) => Number(!!a.reply) - Number(!!b.reply));

  const projectById = new Map((projectsRes.data ?? []).map((p) => [p.id, p]));
  const sort: SortKey = (searchParams.sort as SortKey) ?? "newest";

  const reviews = [...(reviewsRes.data ?? [])].sort((a, b) => {
    switch (sort) {
      case "oldest":
        return new Date(a.requested_at).getTime() - new Date(b.requested_at).getTime();
      case "rating_high":
        return (b.rating ?? -1) - (a.rating ?? -1);
      case "rating_low":
        return (a.rating ?? 6) - (b.rating ?? 6);
      case "status":
        return a.status.localeCompare(b.status);
      case "newest":
      default:
        return new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime();
    }
  });

  return (
    <main className="min-h-screen bg-page sm:pl-64">
      <style dangerouslySetInnerHTML={{ __html: brandThemeStyleTag(tenant.brand_theme) }} />
      <AppSidebar businessName={tenant.business_name} logoUrl={tenant.logo_url} signOutAction={signOut} role={role ?? "owner"} />
      <div className="mx-auto max-w-4xl px-6 py-8">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/8 bg-surface px-5 py-4 shadow-sm">
          <div>
            <h1 className="flex items-center gap-2 font-display text-xl font-extrabold text-ink sm:text-2xl">
              <IconStar className="h-5 w-5 text-brand" />
              Reviews
            </h1>
            <p className="mt-1 text-sm text-muted">Every review across every project - request and record from a project&apos;s own page.</p>
          </div>
          <ReviewsSortSelect current={sort} />
        </header>

        {googleReviews.length > 0 && (
          <div className="mt-5 rounded-2xl border border-black/8 bg-surface p-5 shadow-sm">
            <h2 className="text-sm font-bold text-ink">Your Google reviews</h2>
            <p className="mt-1 text-sm text-muted">From your Google profile, updated daily. Ones still waiting for a reply are at the top.</p>
            <div className="mt-2">
              {googleReviews.map((r) => (
                <GoogleReviewCard key={r.id} review={r} canReply={canReply} />
              ))}
            </div>
          </div>
        )}

        <div className="mt-5 rounded-2xl border border-black/8 bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-bold text-ink">Reply to a Google review</h2>
          {canReply ? (
            <>
              <p className="mb-3 mt-1 text-sm text-muted">
                Paste a review from Google and get a reply to check and post. Replying to every review - the bad ones most of all - is
                part of how people judge you.
              </p>
              <ReviewReplyDrafter />
            </>
          ) : (
            <p className="mt-1 text-sm text-muted">
              Part of the Growth plan: a ready-to-post reply to any Google review, good or bad, in seconds. Use Website help or reply to
              any Scalar Digital email to switch.
            </p>
          )}
        </div>

        <div className="mt-5 rounded-2xl border border-black/8 bg-surface p-5 shadow-sm">
          {reviews.length === 0 ? (
            <div className="rounded-xl border border-dashed border-black/15 py-8 text-center">
              <p className="text-sm font-semibold text-ink">No reviews yet</p>
              <p className="mt-1 px-2 text-sm text-muted">Request one from a project&apos;s page once it&apos;s complete.</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {reviews.map((r) => {
                const project = r.project_id ? projectById.get(r.project_id) : null;
                return (
                  <div key={r.id} className="row-hover flex flex-col gap-2 border-b border-black/8 py-3 last:border-none sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        {r.customer_name}
                        {project && (
                          <Link href={`/projects/${project.id}`} className="ml-2 text-xs font-normal text-brand hover:underline">
                            {project.ref ?? project.client_name}
                          </Link>
                        )}
                      </p>
                      {r.status === "received" ? (
                        <>
                          <Stars rating={r.rating} />
                          {r.review_text && <p className="mt-1 text-sm text-ink-2">&ldquo;{r.review_text}&rdquo;</p>}
                        </>
                      ) : (
                        <p className="text-xs text-muted">Requested, awaiting response</p>
                      )}
                    </div>
                    {r.project_id && (
                      <div className="flex flex-none items-center gap-2">
                        {r.status === "received" && (
                          <ReviewPublishToggle projectId={r.project_id} reviewId={r.id} published={r.published} />
                        )}
                        {r.status === "requested" && (
                          <ReviewSendRequestButton projectId={r.project_id} tenantId={tenant.id} reviewId={r.id} />
                        )}
                        <DeleteButton
                          action={deleteReview.bind(null, r.project_id)}
                          id={r.id}
                          confirmText={`Delete the review request for ${r.customer_name}?`}
                          className="min-h-[28px] rounded-lg border border-[rgba(208,59,59,0.3)] bg-[rgba(208,59,59,0.08)] px-2 py-1 text-xs font-semibold text-critical hover:bg-[rgba(208,59,59,0.15)]"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
