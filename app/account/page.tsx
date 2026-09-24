import { redirect } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/membershipRole";
import { brandThemeStyleTag } from "@/lib/theme";
import { signOut } from "@/app/login/actions";
import { AppSidebar } from "@/components/AppSidebar";
import { MfaSettings } from "@/components/MfaSettings";
import { IconShield } from "@/components/DashboardIcons";

export const dynamic = "force-dynamic";

// Deliberately reachable by both roles (see the comment on the sidebar
// LINKS array) - two-factor is a setting on the signed-in person's own
// account, not something an 'owner' manages on a 'member's' behalf.
export default async function AccountPage() {
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/login");

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const role = await getCurrentUserRole(supabase, tenant.id, userData.user.id);
  if (!role) redirect("/login");

  const { data: factorsData } = await supabase.auth.mfa.listFactors();
  const verifiedFactors = (factorsData?.totp ?? [])
    .filter((f) => f.status === "verified")
    .map((f) => ({ id: f.id, friendlyName: f.friendly_name ?? null }));

  return (
    <main className="min-h-screen bg-page sm:pl-64">
      <style dangerouslySetInnerHTML={{ __html: brandThemeStyleTag(tenant.brand_theme) }} />
      <AppSidebar businessName={tenant.business_name} logoUrl={tenant.logo_url} signOutAction={signOut} role={role} />
      <div className="mx-auto max-w-2xl px-6 py-8">
        <header>
          <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold text-ink sm:text-3xl">
            <IconShield className="h-5 w-5 text-brand" />
            Security
          </h1>
          <p className="mt-1 text-sm text-muted">{userData.user.email}</p>
        </header>

        <div className="mt-6">
          <MfaSettings initialFactors={verifiedFactors} />
        </div>
      </div>
    </main>
  );
}
