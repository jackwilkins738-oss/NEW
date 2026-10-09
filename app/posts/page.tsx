import { redirect } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { brandThemeStyleTag } from "@/lib/theme";
import { signOut } from "@/app/login/actions";
import { IconDocument } from "@/components/DashboardIcons";
import { AppSidebar } from "@/components/AppSidebar";
import { getCurrentUserRole } from "@/lib/membershipRole";
import { planIncludes } from "@/lib/plans";
import { JobPostCard, type JobPostView } from "@/app/posts/JobPostCard";

export const dynamic = "force-dynamic";

// Job posts (migration 065): finished jobs written up for the client's
// website and Google profile, waiting for their approval.
export default async function PostsPage() {
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/login");
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");
  const role = await getCurrentUserRole(supabase, tenant.id, userData.user.id);

  // The plan isn't among the tenant columns a page reads by default - read it on its own.
  const { data: planRow } = await createAdminClient().from("tenants").select("plan").eq("id", tenant.id).maybeSingle();
  const included = planIncludes(planRow?.plan, "seo_pages");
  // google_post_name comes with migration 068 - read without it until then.
  const read = (cols: string) =>
    supabase.from("job_posts").select(cols).eq("tenant_id", tenant.id).neq("status", "skipped").order("created_at", { ascending: false }).limit(50);
  const base = "id, status, title, body, google_post, photos, page_url, created_at";
  const first = await read(`${base}, google_post_name`);
  const rows = first.error ? (await read(base)).data : first.data;
  const posts = (rows ?? []) as unknown as (JobPostView & { created_at: string })[];
  const waiting = posts.filter((p) => p.status === "draft");
  const rest = posts.filter((p) => p.status !== "draft");

  return (
    <main className="min-h-screen bg-page sm:pl-64">
      <style dangerouslySetInnerHTML={{ __html: brandThemeStyleTag(tenant.brand_theme) }} />
      <AppSidebar businessName={tenant.business_name} logoUrl={tenant.logo_url} signOutAction={signOut} role={role ?? "owner"} />
      <div className="mx-auto max-w-4xl px-6 py-8">
        <header className="rounded-2xl border border-black/8 bg-surface px-5 py-4 shadow-sm">
          <h1 className="flex items-center gap-2 font-display text-xl font-extrabold text-ink sm:text-2xl">
            <IconDocument className="h-5 w-5 text-brand" />
            Website posts
          </h1>
          <p className="mt-1 text-sm text-muted">
            Mark a job complete with photos and it&apos;s written up here as a page for your website and a post for Google. Approve it and it&apos;s live
            the next morning - more pages about real local jobs is what moves you up the search results.
          </p>
        </header>

        {!included && posts.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-dashed border-black/15 bg-surface p-6 text-center">
            <p className="text-sm font-semibold text-ink">Part of the Growth plan</p>
            <p className="mt-1 text-sm text-muted">
              Every finished job turned into a website page and a Google post, plus help with your reviews. Reply to any Scalar Digital email or use
              Website help to switch.
            </p>
          </div>
        ) : (
          <>
            <h2 className="mt-6 text-sm font-bold text-ink">Waiting for you ({waiting.length})</h2>
            {waiting.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Nothing to approve. Add photos to a job and mark it complete - its post appears here within a day.</p>
            ) : (
              <div className="mt-3 grid gap-4">
                {waiting.map((p) => (
                  <JobPostCard key={p.id} post={p} />
                ))}
              </div>
            )}
            {rest.length > 0 && (
              <>
                <h2 className="mt-8 text-sm font-bold text-ink">Approved and live</h2>
                <div className="mt-3 grid gap-4">
                  {rest.map((p) => (
                    <JobPostCard key={p.id} post={p} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
