import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformAdmin } from "@/lib/platformAdmin";
import { AdminPanel } from "@/components/AdminPanel";

export default async function AdminPage() {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");
  if (!(await isPlatformAdmin(userData.user.id))) redirect("/login");

  const { data: tenants } = await supabase
    .from("tenants")
    .select("id, business_name, slug, domain, site_key, brand_theme, created_at")
    .order("created_at", { ascending: false });

  // Regular RLS only lets a member read their own membership rows - fine
  // for the dashboard, useless here where the whole point is seeing every
  // tenant's members. Service role bypasses that; requireAdmin() inside
  // the /admin actions (and the isPlatformAdmin check above, for this page
  // itself) is the actual authorization gate, not RLS, for anything in here.
  const admin = createAdminClient();
  const { data: memberships } = await admin.from("memberships").select("id, tenant_id, user_id");
  const { data: usersPage } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const emailById = new Map(usersPage?.users.map((u) => [u.id, u.email ?? "(no email)"]) ?? []);

  const membersByTenant: Record<string, { membershipId: string; email: string }[]> = {};
  for (const m of memberships ?? []) {
    (membersByTenant[m.tenant_id] ??= []).push({ membershipId: m.id, email: emailById.get(m.user_id) ?? m.user_id });
  }

  return (
    <main className="min-h-screen bg-page px-6 py-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Scalar Digital</p>
          <h1 className="font-display text-2xl font-extrabold text-ink">Customer admin</h1>
        </header>
        <AdminPanel tenants={tenants ?? []} membersByTenant={membersByTenant} />
      </div>
    </main>
  );
}
