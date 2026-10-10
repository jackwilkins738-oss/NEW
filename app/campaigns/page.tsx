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
import { audience, MIN_DAYS_BETWEEN, seasonalIdeas } from "@/lib/campaigns";
import { todayInUK } from "@/lib/ukDate";
import { CampaignComposer } from "@/app/campaigns/CampaignComposer";

export const dynamic = "force-dynamic";

// Campaigns (Growth plan and up, migration 069): a seasonal email to past customers.
export default async function CampaignsPage() {
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/login");
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");
  const role = await getCurrentUserRole(supabase, tenant.id, userData.user.id);
  const admin = createAdminClient();
  const { data: planRow } = await admin.from("tenants").select("plan").eq("id", tenant.id).maybeSingle();
  const included = planIncludes(planRow?.plan, "campaigns");
  const people = included ? await audience(admin, tenant.id).then((a) => a.length).catch(() => null) : null;
  const { data: past } = await supabase
    .from("campaigns")
    .select("id, subject, sent_count, sent_at")
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false })
    .limit(12);
  const month = Number(todayInUK().slice(5, 7));

  return (
    <main className="min-h-screen bg-page sm:pl-64">
      <style dangerouslySetInnerHTML={{ __html: brandThemeStyleTag(tenant.brand_theme) }} />
      <AppSidebar businessName={tenant.business_name} logoUrl={tenant.logo_url} signOutAction={signOut} role={role ?? "owner"} />
      <div className="mx-auto max-w-3xl px-6 py-8">
        <header className="rounded-2xl border border-black/8 bg-surface px-5 py-4 shadow-sm">
          <h1 className="flex items-center gap-2 font-display text-xl font-extrabold text-ink sm:text-2xl">
            <IconDocument className="h-5 w-5 text-brand" />
            Campaigns
          </h1>
          <p className="mt-1 text-sm text-muted">
            A short email to your past customers when there&apos;s a reason to get in touch: the season, a gap in your diary, a new
            service. Repeat work from people who already trust you.
          </p>
        </header>

        {!included ? (
          <div className="mt-5 rounded-2xl border border-dashed border-black/15 bg-surface p-6 text-center">
            <p className="text-sm font-semibold text-ink">Part of the Growth plan</p>
            <p className="mt-1 text-sm text-muted">Seasonal emails to your past customers, written for you. Use Website help to ask about it.</p>
          </div>
        ) : (
          <>
            <div className="mt-5 rounded-2xl border border-black/8 bg-surface p-5 shadow-sm">
              {people === null ? (
                <p className="text-sm text-muted">Not switched on yet - Scalar Digital needs to finish setting it up.</p>
              ) : (
                <>
                  <p className="mb-4 text-sm text-muted">
                    Goes to <strong className="text-ink">{people}</strong> past customer{people === 1 ? "" : "s"}: everyone with a job on
                    your dashboard and an email address, who hasn&apos;t unsubscribed or had a campaign in the last {MIN_DAYS_BETWEEN} days.
                    Replies come straight to your email.
                  </p>
                  <CampaignComposer ideas={seasonalIdeas(month)} audience={people} />
                </>
              )}
            </div>
            {(past ?? []).length > 0 && (
              <div className="mt-5 rounded-2xl border border-black/8 bg-surface p-5 shadow-sm">
                <h2 className="text-sm font-bold text-ink">Sent</h2>
                <ul className="mt-2">
                  {(past ?? []).map((c) => (
                    <li key={c.id} className="flex justify-between gap-3 border-b border-black/8 py-2 text-sm last:border-none">
                      <span className="text-ink">{c.subject}</span>
                      <span className="flex-none text-xs text-muted">
                        {c.sent_count} sent
                        {c.sent_at ? ` · ${new Date(c.sent_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
