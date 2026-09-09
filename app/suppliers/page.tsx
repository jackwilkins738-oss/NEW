import { redirect } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { brandThemeStyleTag } from "@/lib/theme";
import { signOut } from "@/app/login/actions";
import { IconTruck } from "@/components/DashboardIcons";
import { AppSidebar } from "@/components/AppSidebar";
import { addSupplier, deleteSupplier } from "@/app/dashboard/actions";
import { DeleteButton } from "@/components/DeleteButton";

export const dynamic = "force-dynamic";

const field =
  "mt-1 w-full rounded-lg border border-black/15 bg-surface px-2.5 py-2 text-base text-ink outline-none focus:border-brand sm:text-sm";
const label = "text-xs font-semibold text-ink-2";

export default async function SuppliersPage() {
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/login");

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, name, contact_name, account_number, phone, email, categories")
    .eq("tenant_id", tenant.id)
    .order("name", { ascending: true });

  return (
    <main className="min-h-screen bg-page sm:pl-64">
      <style dangerouslySetInnerHTML={{ __html: brandThemeStyleTag(tenant.brand_theme) }} />
      <AppSidebar businessName={tenant.business_name} logoUrl={tenant.logo_url} signOutAction={signOut} />
      <div className="mx-auto max-w-3xl px-6 py-8">
        <header className="rounded-2xl border border-black/8 bg-surface px-5 py-4 shadow-sm">
          <h1 className="flex items-center gap-2 font-display text-xl font-extrabold text-ink sm:text-2xl">
            <IconTruck className="h-5 w-5 text-brand" />
            Suppliers
          </h1>
          <p className="mt-1 text-sm text-muted">A simple directory - not linked to cost items yet, just somewhere to keep them.</p>
        </header>

        <form
          action={addSupplier}
          className="mt-5 grid grid-cols-1 gap-2 rounded-2xl border border-black/8 bg-surface p-5 shadow-sm sm:grid-cols-3 sm:items-end"
        >
          <input type="hidden" name="tenantId" value={tenant.id} />
          <label className={label}>
            Supplier name
            <input name="name" required className={field} />
          </label>
          <label className={label}>
            Contact name
            <input name="contactName" className={field} />
          </label>
          <label className={label}>
            Account number
            <input name="accountNumber" className={field} />
          </label>
          <label className={label}>
            Phone
            <input name="phone" className={field} />
          </label>
          <label className={label}>
            Email
            <input name="email" type="email" className={field} />
          </label>
          <label className={label}>
            Categories
            <input name="categories" className={field} placeholder="e.g. Timber, Roofing" />
          </label>
          <button
            type="submit"
            className="btn-primary rounded-lg bg-brand px-3 py-2.5 text-sm font-bold text-white hover:bg-brand-strong sm:col-span-3 sm:w-auto sm:justify-self-start sm:py-1.5"
          >
            Add supplier
          </button>
        </form>

        <div className="mt-5 rounded-2xl border border-black/8 bg-surface p-5 shadow-sm">
          {(suppliers ?? []).length === 0 ? (
            <div className="rounded-xl border border-dashed border-black/15 py-8 text-center">
              <p className="text-sm font-semibold text-ink">No suppliers yet</p>
              <p className="mt-1 px-2 text-sm text-muted">Add one above.</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {(suppliers ?? []).map((s) => (
                <div key={s.id} className="row-hover flex items-center justify-between gap-3 border-b border-black/8 py-3 last:border-none">
                  <div>
                    <p className="text-sm font-semibold text-ink">{s.name}</p>
                    <p className="text-xs text-muted">
                      {s.contact_name ?? "no contact"} {s.phone ? `· ${s.phone}` : ""} {s.email ? `· ${s.email}` : ""}
                      {s.account_number ? ` · acct ${s.account_number}` : ""}
                      {s.categories ? ` · ${s.categories}` : ""}
                    </p>
                  </div>
                  <DeleteButton
                    action={deleteSupplier}
                    id={s.id}
                    confirmText={`Delete ${s.name}?`}
                    className="min-h-[32px] rounded-lg border border-[rgba(208,59,59,0.3)] bg-[rgba(208,59,59,0.08)] px-2.5 py-1.5 text-xs font-semibold text-critical hover:bg-[rgba(208,59,59,0.15)]"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
