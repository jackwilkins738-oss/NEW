import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformAdmin } from "@/lib/platformAdmin";
import { AdminPanel } from "@/components/AdminPanel";
import { signOut } from "@/app/login/actions";
import { DemoResetButton } from "@/app/admin/DemoResetButton";
import { ClientCarePanel } from "@/app/admin/ClientCarePanel";

// Customer/membership lists change from this same page's own actions
// (create tenant, invite, remove) - never let Next.js serve a cached
// snapshot after one of those.
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createClient();
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

  // Aftercare columns (migration 041) sit outside the session client's
  // column grant, so they're read here with the service role and merged in.
  const { data: aftercareRows } = await admin.from("tenants").select("id, launched_on, free_hosting_months, contact_email");
  const aftercareById = new Map((aftercareRows ?? []).map((r) => [r.id, r]));
  const tenantsWithAftercare = (tenants ?? []).map((t) => ({
    ...t,
    launched_on: aftercareById.get(t.id)?.launched_on ?? null,
    free_hosting_months: aftercareById.get(t.id)?.free_hosting_months ?? 12,
    contact_email: aftercareById.get(t.id)?.contact_email ?? null,
  }));

  const { data: memberships } = await admin.from("memberships").select("id, tenant_id, user_id, role");
  const { data: usersPage } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const emailById = new Map(usersPage?.users.map((u) => [u.id, u.email ?? "(no email)"]) ?? []);

  const membersByTenant: Record<string, { membershipId: string; email: string; role: "owner" | "member" }[]> = {};
  for (const m of memberships ?? []) {
    (membersByTenant[m.tenant_id] ??= []).push({
      membershipId: m.id,
      email: emailById.get(m.user_id) ?? m.user_id,
      role: (m.role as "owner" | "member" | null) ?? "owner",
    });
  }

  // Client care (migration 051) - each read on its own, so /admin still works before it runs.
  const { data: billingRows, error: billingError } = await admin.from("tenants").select("id, billing_status");
  const billingById = new Map((billingRows ?? []).map((r) => [r.id, r.billing_status as string | null]));
  const { data: siteRows, error: siteError } = await admin.from("tenants").select("id, website_url, site_status");
  const siteById = new Map((siteRows ?? []).map((r) => [r.id, r]));
  const careTenants = tenantsWithAftercare
    .filter((t) => t.launched_on && t.slug !== "demo")
    .map((t) => ({
      id: t.id,
      business_name: t.business_name,
      launched_on: t.launched_on,
      billing_status: billingById.get(t.id) ?? null,
      website_url: siteById.get(t.id)?.website_url ?? null,
      site_status: siteById.get(t.id)?.site_status ?? null,
    }));
  const { data: requestRows, error: requestsError } = await admin
    .from("change_requests")
    .select("id, tenant_id, message, created_at")
    .eq("status", "open")
    .order("created_at", { ascending: true });
  const nameById = new Map((tenants ?? []).map((t) => [t.id, t.business_name]));
  const changeRequests = (requestRows ?? []).map((r) => ({ id: r.id, tenant: nameById.get(r.tenant_id) ?? "Unknown", message: r.message, created_at: r.created_at }));

  return (
    <main className="min-h-screen bg-page px-6 py-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">Scalar Digital</p>
            <h1 className="font-display text-2xl font-extrabold text-ink">Customer admin</h1>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <DemoResetButton />
            <form action={signOut}>
              <button className="w-full rounded-lg border border-black/8 bg-surface-2 px-3 py-2.5 text-sm font-semibold text-ink sm:w-auto sm:py-2">
                Sign out
              </button>
            </form>
          </div>
        </header>
        <ClientCarePanel tenants={careTenants} requests={changeRequests} billingReady={!billingError} requestsReady={!requestsError} monitorReady={!siteError} />
        <div className="mt-5">
          <AdminPanel tenants={tenantsWithAftercare} membersByTenant={membersByTenant} />
        </div>
      </div>
    </main>
  );
}
