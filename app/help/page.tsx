import { redirect } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { brandThemeStyleTag } from "@/lib/theme";
import { signOut } from "@/app/login/actions";
import { AppSidebar } from "@/components/AppSidebar";
import { getCurrentUserRole } from "@/lib/membershipRole";
import { ChangeRequestForm } from "@/app/help/ChangeRequestForm";

export const dynamic = "force-dynamic";

// "Website help": the one place a client asks Scalar Digital for a change to
// their site, and sees what they've asked for before.
export default async function HelpPage(props: { searchParams: Promise<{ billing?: string }> }) {
  const searchParams = await props.searchParams;
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/login");
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");
  const role = await getCurrentUserRole(supabase, tenant.id, userData.user.id);
  if (!role) redirect("/login");

  const { data: requests, error } = await supabase
    .from("change_requests")
    .select("id, message, status, created_at, done_at")
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <main className="min-h-screen bg-page sm:pl-64">
      <style dangerouslySetInnerHTML={{ __html: brandThemeStyleTag(tenant.brand_theme) }} />
      <AppSidebar businessName={tenant.business_name} logoUrl={tenant.logo_url} signOutAction={signOut} role={role} />
      <div className="mx-auto max-w-2xl px-6 py-8">
        <h1 className="font-display text-2xl font-extrabold text-ink sm:text-3xl">Website help</h1>
        <p className="mt-1 text-sm text-muted">Ask for a change to your website - wording, photos, services, a new page.</p>

        {searchParams.billing === "done" && (
          <p className="mt-4 rounded-lg bg-[rgba(12,163,12,0.1)] p-3.5 text-sm font-semibold text-good">
            Thanks - your card is saved. Nothing is charged until your free period ends.
          </p>
        )}

        <div className="mt-5 rounded-2xl border border-black/8 bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-bold text-ink">Request a change</h2>
          {error ? (
            <p className="mt-2 text-sm text-muted">
              Email <a className="text-brand underline" href="mailto:hello@scalardigital.co.uk">hello@scalardigital.co.uk</a> with what you&apos;d like changed.
            </p>
          ) : (
            <ChangeRequestForm tenantId={tenant.id} />
          )}
        </div>

        {(requests ?? []).length > 0 && (
          <div className="mt-5 rounded-2xl border border-black/8 bg-surface p-5 shadow-sm">
            <h2 className="text-sm font-bold text-ink">Your requests</h2>
            <ul className="mt-2 flex flex-col">
              {(requests ?? []).map((r) => (
                <li key={r.id} className="border-b border-black/8 py-3 last:border-none">
                  <p className="text-xs font-semibold text-muted">
                    {new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} ·{" "}
                    <span className={r.status === "done" ? "text-good" : "text-[#8a5a00]"}>{r.status === "done" ? "Done" : "With us"}</span>
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm text-ink-2">{r.message}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
