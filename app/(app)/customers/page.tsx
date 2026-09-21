import { redirect } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { IconUsers } from "@/components/DashboardIcons";
import { CustomersListPanel } from "@/components/CustomersListPanel";
import { addCustomer } from "@/app/actions";
import { field, label } from "@/lib/formStyles";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/login");

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const [customersRes, projectsRes] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, email, phone, created_at")
      .eq("tenant_id", tenant.id)
      .order("name", { ascending: true }),
    supabase.from("projects").select("id, customer_id, value_pence, status").eq("tenant_id", tenant.id),
  ]);

  const customers = customersRes.data ?? [];
  const projects = projectsRes.data ?? [];

  const projectsByCustomer = new Map<string, { count: number; totalValue: number }>();
  for (const p of projects) {
    if (!p.customer_id) continue;
    const entry = projectsByCustomer.get(p.customer_id) ?? { count: 0, totalValue: 0 };
    entry.count += 1;
    entry.totalValue += p.value_pence ?? 0;
    projectsByCustomer.set(p.customer_id, entry);
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="rounded-2xl border border-black/8 bg-surface px-5 py-4 shadow-sm">
        <h1 className="flex items-center gap-2 font-display text-xl font-extrabold text-ink sm:text-2xl">
          <IconUsers className="h-5 w-5 text-brand" />
          Customers
        </h1>
        <p className="mt-1 text-sm text-muted">
          Created automatically when a lead or quote converts to a project, or add one by hand below - one
          record per customer across every job they've had.
        </p>
      </header>

      <form
        action={addCustomer}
        className="mt-5 grid grid-cols-1 gap-2 rounded-2xl border border-black/8 bg-surface p-5 shadow-sm sm:grid-cols-4 sm:items-end"
      >
        <input type="hidden" name="tenantId" value={tenant.id} />
        <label className={label}>
          Name
          <input name="name" required className={field} />
        </label>
        <label className={label}>
          Email
          <input name="email" type="email" className={field} />
        </label>
        <label className={label}>
          Phone
          <input name="phone" className={field} />
        </label>
        <button type="submit" className="btn-primary rounded-lg bg-brand px-3 py-2.5 text-sm font-bold text-white hover:bg-brand-strong sm:py-1.5">
          Add customer
        </button>
      </form>

      <CustomersListPanel
        customers={customers.map((c) => {
          const stats = projectsByCustomer.get(c.id) ?? { count: 0, totalValue: 0 };
          return { id: c.id, name: c.name, email: c.email, phone: c.phone, projectCount: stats.count, totalValuePence: stats.totalValue };
        })}
      />
    </div>
  );
}
