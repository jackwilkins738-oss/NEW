import { redirect } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { formatGBP } from "@/lib/format";
import { brandThemeStyleTag } from "@/lib/theme";
import { signOut } from "@/app/login/actions";
import { IconHardHat } from "@/components/DashboardIcons";
import { AppSidebar } from "@/components/AppSidebar";
import { addTeamMember, deleteTeamMember } from "@/app/dashboard/actions";
import { DeleteButton } from "@/components/DeleteButton";

export const dynamic = "force-dynamic";

const field =
  "mt-1 w-full rounded-lg border border-black/15 bg-surface px-2.5 py-2 text-base text-ink outline-none focus:border-brand sm:text-sm";
const label = "text-xs font-semibold text-ink-2";

export default async function TeamPage() {
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/login");

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const { data: team } = await supabase
    .from("team_members")
    .select("id, name, role, phone, email, cost_per_hour_pence")
    .eq("tenant_id", tenant.id)
    .order("name", { ascending: true });

  return (
    <main className="min-h-screen bg-page sm:pl-64">
      <style dangerouslySetInnerHTML={{ __html: brandThemeStyleTag(tenant.brand_theme) }} />
      <AppSidebar businessName={tenant.business_name} logoUrl={tenant.logo_url} signOutAction={signOut} />
      <div className="mx-auto max-w-3xl px-6 py-8">
        <header className="rounded-2xl border border-black/8 bg-surface px-5 py-4 shadow-sm">
          <h1 className="flex items-center gap-2 font-display text-xl font-extrabold text-ink sm:text-2xl">
            <IconHardHat className="h-5 w-5 text-brand" />
            Team
          </h1>
          <p className="mt-1 text-sm text-muted">Assign these to projects for scheduling and labour costing.</p>
        </header>

        <form
          action={addTeamMember}
          className="mt-5 grid grid-cols-1 gap-2 rounded-2xl border border-black/8 bg-surface p-5 shadow-sm sm:grid-cols-5 sm:items-end"
        >
          <input type="hidden" name="tenantId" value={tenant.id} />
          <label className={label}>
            Name
            <input name="name" required className={field} />
          </label>
          <label className={label}>
            Role
            <input name="role" className={field} placeholder="e.g. Site fitter" />
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
            Cost/hour (&pound;)
            <input name="costPerHour" type="number" min="0" step="0.01" className={field} />
          </label>
          <button
            type="submit"
            className="btn-primary rounded-lg bg-brand px-3 py-2.5 text-sm font-bold text-white hover:bg-brand-strong sm:col-span-5 sm:w-auto sm:justify-self-start sm:py-1.5"
          >
            Add team member
          </button>
        </form>

        <div className="mt-5 rounded-2xl border border-black/8 bg-surface p-5 shadow-sm">
          {(team ?? []).length === 0 ? (
            <div className="rounded-xl border border-dashed border-black/15 py-8 text-center">
              <p className="text-sm font-semibold text-ink">No team members yet</p>
              <p className="mt-1 px-2 text-sm text-muted">Add one above, then assign them to projects from each project's page.</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {(team ?? []).map((t) => (
                <div key={t.id} className="row-hover flex items-center justify-between gap-3 border-b border-black/8 py-3 last:border-none">
                  <div>
                    <p className="text-sm font-semibold text-ink">{t.name}</p>
                    <p className="text-xs text-muted">
                      {t.role ?? "no role"} {t.phone ? `· ${t.phone}` : ""} {t.email ? `· ${t.email}` : ""}
                      {t.cost_per_hour_pence != null ? ` · ${formatGBP(t.cost_per_hour_pence)}/hr` : ""}
                    </p>
                  </div>
                  <DeleteButton
                    action={deleteTeamMember}
                    id={t.id}
                    confirmText={`Remove ${t.name} from your team?`}
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
