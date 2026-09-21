import { redirect } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRoleCached } from "@/lib/membershipRole";
import { brandThemeStyleTag } from "@/lib/theme";
import { AppSidebar } from "@/components/AppSidebar";
import { signOut } from "@/app/login/actions";

// The shell every signed-in page shares.
//
// `(app)` is a route group: the parentheses mean it contributes nothing to
// the URL, so /dashboard, /cashflow, /settings and the rest are all exactly
// where they were. What it buys is a layout Next.js keeps *mounted* across
// navigations between these pages - previously every page rendered its own
// <AppSidebar>, so the whole shell was torn down and rebuilt on every click,
// and any loading state would have had to redraw the sidebar to avoid it
// vanishing mid-navigation. Now the rail simply stays put and only the
// content area swaps.
//
// It also puts the three checks every one of these pages was repeating -
// resolve the tenant, require a signed-in user, require a membership - in
// one place. Both lookups are cache()d per request, so a page re-asking for
// the tenant to run its own queries doesn't pay for it twice.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/login");

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  // Doubles as the membership check: no row means this user isn't a member
  // of this tenant, whatever their login is valid for elsewhere.
  const role = await getCurrentUserRoleCached(tenant.id, userData.user.id);
  if (!role) redirect("/login");

  return (
    <main className="min-h-screen bg-page sm:pl-64">
      <style dangerouslySetInnerHTML={{ __html: brandThemeStyleTag(tenant.brand_theme) }} />
      <AppSidebar businessName={tenant.business_name} logoUrl={tenant.logo_url} signOutAction={signOut} role={role} />
      {children}
    </main>
  );
}
