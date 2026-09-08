import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { formatGBP } from "@/lib/format";
import { brandThemeStyleTag } from "@/lib/theme";
import { IconUsers } from "@/components/DashboardIcons";
import { addCustomer } from "@/app/dashboard/actions";

const field =
  "mt-1 w-full rounded-md border border-black/15 bg-surface px-2.5 py-2 text-base text-ink outline-none focus:border-brand sm:text-sm";
const label = "text-xs font-semibold text-ink-2";

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
    <main className="min-h-screen bg-page px-6 py-8">
      <style dangerouslySetInnerHTML={{ __html: brandThemeStyleTag(tenant.brand_theme) }} />
      <div className="mx-auto max-w-4xl">
        <Link href="/dashboard" className="text-xs font-semibold text-muted hover:text-brand hover:underline">
          &larr; Back to dashboard
        </Link>

        <header className="mt-3 rounded-2xl border border-black/10 bg-surface px-5 py-4 shadow-sm">
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
          className="mt-5 grid grid-cols-1 gap-2 rounded-2xl border border-black/10 bg-surface p-5 shadow-sm sm:grid-cols-4 sm:items-end"
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
          <button type="submit" className="btn-primary rounded-md bg-brand px-3 py-2.5 text-sm font-bold text-white hover:bg-brand-strong sm:py-1.5">
            Add customer
          </button>
        </form>

        <div className="mt-5 rounded-2xl border border-black/10 bg-surface p-5 shadow-sm">
          {customers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-black/15 py-8 text-center">
              <p className="text-sm font-semibold text-ink">No customers yet</p>
              <p className="mt-1 px-2 text-sm text-muted">
                Convert a won lead or an accepted quote into a project and a customer record is created automatically.
              </p>
            </div>
          ) : (
            <div className="flex flex-col">
              {customers.map((c) => {
                const stats = projectsByCustomer.get(c.id) ?? { count: 0, totalValue: 0 };
                return (
                  <Link
                    key={c.id}
                    href={`/customers/${c.id}`}
                    className="row-hover flex items-center justify-between gap-3 border-b border-black/10 py-3 last:border-none hover:bg-surface-2"
                  >
                    <div>
                      <p className="text-sm font-semibold text-ink">{c.name}</p>
                      <p className="text-xs text-muted">
                        {c.email ?? "no email"} {c.phone ? `· ${c.phone}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm font-semibold text-ink">{formatGBP(stats.totalValue)}</p>
                      <p className="text-xs text-muted">
                        {stats.count} project{stats.count === 1 ? "" : "s"}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
