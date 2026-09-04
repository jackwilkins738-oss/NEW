import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

  return (
    <main className="min-h-screen bg-page px-6 py-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Scalar Digital</p>
          <h1 className="font-display text-2xl font-extrabold text-ink">Customer admin</h1>
        </header>
        <AdminPanel tenants={tenants ?? []} />
      </div>
    </main>
  );
}
