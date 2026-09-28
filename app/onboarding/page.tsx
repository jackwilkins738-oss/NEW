import { redirect } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { brandThemeStyleTag } from "@/lib/theme";
import { signOut } from "@/app/login/actions";
import { AppSidebar } from "@/components/AppSidebar";
import { IconDocument } from "@/components/DashboardIcons";
import { getCurrentUserRole } from "@/lib/membershipRole";
import { ONBOARDING_QUESTION_COUNT, ONBOARDING_SECTIONS, answeredCount, normaliseAnswers } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

// What each new website client sent from their onboarding page
// (app/welcome), newest first. Session-scoped: RLS limits both tables and
// the storage bucket to this tenant's members (migration 043). Linked from
// the "X sent their website details" email rather than the sidebar, since
// only Scalar's own sales ever create these.
export default async function OnboardingPage() {
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/login");
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");
  const role = await getCurrentUserRole(supabase, tenant.id, userData.user.id);

  const [{ data: rows }, { data: files }] = await Promise.all([
    supabase
      .from("onboarding")
      .select("id, client_name, answers, submitted_at, updated_at, created_at")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false }),
    supabase.from("onboarding_files").select("id, onboarding_id, filename, kind, storage_path").eq("tenant_id", tenant.id).order("created_at"),
  ]);
  const signed = await Promise.all(
    (files ?? []).map(async (f) => {
      const { data } = await supabase.storage.from("onboarding-uploads").createSignedUrl(f.storage_path, 3600, { download: f.filename });
      return { ...f, url: data?.signedUrl ?? null };
    })
  );

  return (
    <main className="min-h-screen bg-page sm:pl-64">
      <style dangerouslySetInnerHTML={{ __html: brandThemeStyleTag(tenant.brand_theme) }} />
      <AppSidebar businessName={tenant.business_name} logoUrl={tenant.logo_url} signOutAction={signOut} role={role ?? "owner"} />
      <div className="mx-auto max-w-4xl px-6 py-8">
        <header className="rounded-2xl border border-black/8 bg-surface px-5 py-4 shadow-sm">
          <h1 className="flex items-center gap-2 font-display text-xl font-extrabold text-ink sm:text-2xl">
            <IconDocument className="h-5 w-5 text-brand" />
            Client onboarding
          </h1>
          <p className="mt-1 text-sm text-muted">What each new website client sent after accepting their quote. Download links last an hour - reload for fresh ones.</p>
        </header>

        {(rows ?? []).length === 0 && (
          <div className="mt-5 rounded-xl border border-dashed border-black/15 py-8 text-center text-sm text-muted">
            Nothing yet - a client gets their onboarding link when they accept a quote made from the outreach panel.
          </div>
        )}

        {(rows ?? []).map((row) => {
          const answers = normaliseAnswers(row.answers);
          const mine = signed.filter((f) => f.onboarding_id === row.id);
          return (
            <section key={row.id} className="mt-5 rounded-2xl border border-black/8 bg-surface p-5 shadow-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-lg font-bold text-ink">{row.client_name}</h2>
                <p className="text-xs text-muted">
                  {row.submitted_at
                    ? `Sent ${new Date(row.submitted_at).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}`
                    : "Not sent yet (saved as they go)"}{" "}
                  · {answeredCount(answers)} of {ONBOARDING_QUESTION_COUNT} answered · {mine.length} file{mine.length === 1 ? "" : "s"}
                </p>
              </div>
              {ONBOARDING_SECTIONS.map((s) => {
                const shown = s.questions.filter((q) => answers[q.id]);
                if (!shown.length) return null;
                return (
                  <div key={s.title} className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{s.title}</p>
                    <dl className="mt-1 divide-y divide-black/8">
                      {shown.map((q) => (
                        <div key={q.id} className="grid gap-1 py-2 sm:grid-cols-[14rem_1fr]">
                          <dt className="text-sm text-ink-2">{q.label}</dt>
                          <dd className="whitespace-pre-line text-sm text-ink">{answers[q.id]}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                );
              })}
              {mine.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Files</p>
                  <ul className="mt-1 flex flex-wrap gap-2">
                    {mine.map((f) => (
                      <li key={f.id}>
                        {f.url ? (
                          <a href={f.url} className="inline-block rounded-lg border border-black/10 px-3 py-1.5 text-sm text-brand hover:underline">
                            {f.kind === "logo" ? "Logo: " : ""}
                            {f.filename}
                          </a>
                        ) : (
                          <span className="text-sm text-muted">{f.filename}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </main>
  );
}
