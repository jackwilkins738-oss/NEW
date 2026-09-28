import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { brandThemeStyleTag } from "@/lib/theme";
import { normaliseAnswers } from "@/lib/onboarding";
import { WelcomeForm } from "@/app/welcome/WelcomeForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your new website", robots: { index: false, follow: false } };

// A website client's onboarding page: everything the build needs, in one
// place. Reached only from the link sent once they accept their quote - the
// token in the URL is what proves it's them (as on the quote page), so this
// reads through the service-role client. Wrong id or token -> 404.
export default async function WelcomePage(props: { params: Promise<{ id: string; token: string }> }) {
  const { id, token } = await props.params;
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("onboarding")
    .select("id, tenant_id, token, client_name, answers, submitted_at")
    .eq("id", id)
    .maybeSingle();
  if (!row || row.token !== token) notFound();

  const [{ data: tenant }, { data: files }] = await Promise.all([
    admin.from("tenants").select("business_name, brand_theme, contact_email").eq("id", row.tenant_id).maybeSingle(),
    admin.from("onboarding_files").select("id, filename, kind, storage_path").eq("onboarding_id", row.id).order("created_at"),
  ]);
  // Short-lived previews of what they've uploaded so far, so they can see it arrived.
  const withPreviews = await Promise.all(
    (files ?? []).map(async (f) => {
      const { data } = await admin.storage.from("onboarding-uploads").createSignedUrl(f.storage_path, 3600);
      return { id: f.id, filename: f.filename, kind: f.kind, preview: data?.signedUrl ?? null };
    })
  );

  return (
    <main className="min-h-screen bg-page px-5 py-10 sm:py-14">
      <style dangerouslySetInnerHTML={{ __html: brandThemeStyleTag(tenant?.brand_theme ?? "rust") }} />
      <div className="mx-auto max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{tenant?.business_name ?? "Scalar Digital"}</p>
        <h1 className="mt-1 font-display text-2xl font-extrabold text-ink sm:text-3xl">Your new website: the details</h1>
        <p className="mt-2 text-sm text-ink-2">
          Everything we need to build {row.client_name}&apos;s site, in one place. Answer what you can - nothing is required,
          it saves as you go, and you can come back to this page any time.
        </p>
        <WelcomeForm
          id={row.id}
          token={row.token}
          initialAnswers={normaliseAnswers(row.answers)}
          initialFiles={withPreviews}
          submittedAt={row.submitted_at}
        />
        {tenant?.contact_email && (
          <p className="mt-6 text-center text-xs text-muted">
            Stuck, or easier to talk it through? Email <a className="underline" href={`mailto:${tenant.contact_email}`}>{tenant.contact_email}</a>.
          </p>
        )}
      </div>
    </main>
  );
}
