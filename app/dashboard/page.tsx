import { redirect } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";

function formatGBP(pence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(pence / 100);
}

const STATUS_LABEL: Record<string, string> = {
  on_track: "On track",
  at_risk: "At risk",
  delayed: "Delayed",
  awaiting_decision: "Awaiting decision",
};

// Explicit rgba() rather than Tailwind's bg-x/15 opacity modifier: that
// modifier isn't reliable against colors sourced from CSS custom properties,
// and there's no way to build-check this project on the current machine
// (no Node.js installed here yet), so this avoids depending on it.
const STATUS_CLASS: Record<string, string> = {
  on_track: "bg-[rgba(12,163,12,0.15)] text-good",
  at_risk: "bg-[rgba(250,178,25,0.25)] text-[#8a5a00]",
  delayed: "bg-[rgba(208,59,59,0.15)] text-critical",
  awaiting_decision: "bg-surface-2 text-ink-2",
};

export default async function DashboardPage() {
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/login");

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const membership = await supabase
    .from("memberships")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!membership.data) redirect("/login");

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [leadsRes, pageviewsRes, projectsRes] = await Promise.all([
    supabase
      .from("leads")
      .select("id, name, email, source, created_at")
      .eq("tenant_id", tenant.id)
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false }),
    supabase
      .from("pageviews")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id)
      .gte("created_at", thirtyDaysAgo),
    supabase
      .from("projects")
      .select("id, ref, client_name, location, project_type, stage, value_pence, pm, target_date, status")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false }),
  ]);

  const leads = leadsRes.data ?? [];
  const pageviewCount = pageviewsRes.count ?? 0;
  const projects = projectsRes.data ?? [];
  const pipelineValue = projects
    .filter((p) => p.status === "on_track" || p.status === "at_risk")
    .reduce((sum, p) => sum + (p.value_pence ?? 0), 0);

  return (
    <main className="min-h-screen bg-page px-6 py-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex items-center justify-between rounded-2xl border border-black/10 bg-surface px-6 py-4 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
              Operations &amp; Sales Dashboard
            </p>
            <h1 className="font-display text-2xl font-extrabold text-ink">
              {tenant.business_name}
            </h1>
          </div>
          <form action={signOut}>
            <button className="rounded-lg border border-black/10 bg-surface-2 px-3 py-2 text-sm font-semibold text-ink">
              Sign out
            </button>
          </form>
        </header>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-black/10 bg-surface p-5 shadow-sm">
            <p className="text-sm font-semibold text-ink-2">Leads &middot; last 30 days</p>
            <p className="mt-2 text-3xl font-bold text-ink">{leads.length}</p>
          </div>
          <div className="rounded-2xl border border-black/10 bg-surface p-5 shadow-sm">
            <p className="text-sm font-semibold text-ink-2">Page views &middot; last 30 days</p>
            <p className="mt-2 text-3xl font-bold text-ink">{pageviewCount}</p>
          </div>
          <div className="rounded-2xl border border-black/10 bg-surface p-5 shadow-sm">
            <p className="text-sm font-semibold text-ink-2">Live pipeline value</p>
            <p className="mt-2 text-3xl font-bold text-ink">{formatGBP(pipelineValue)}</p>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="rounded-2xl border border-black/10 bg-surface p-5 shadow-sm lg:col-span-2">
            <h2 className="text-sm font-bold text-ink">Active projects</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-xs font-bold uppercase tracking-wide text-muted">
                    <th className="pb-2">Project</th>
                    <th className="pb-2">Stage</th>
                    <th className="pb-2">Value</th>
                    <th className="pb-2">Target</th>
                    <th className="pb-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-muted">
                        No projects yet.
                      </td>
                    </tr>
                  )}
                  {projects.map((p) => (
                    <tr key={p.id} className="border-t border-black/10">
                      <td className="py-2.5">
                        <div className="font-mono text-xs text-muted">{p.ref}</div>
                        <div className="font-semibold text-ink">{p.client_name}</div>
                        <div className="text-xs text-muted">{p.location}</div>
                      </td>
                      <td className="py-2.5 text-ink-2">{p.stage}</td>
                      <td className="py-2.5 font-mono font-semibold text-ink">
                        {p.value_pence != null ? formatGBP(p.value_pence) : "—"}
                      </td>
                      <td className="py-2.5 text-ink-2">
                        {p.target_date
                          ? new Date(p.target_date).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })
                          : "TBC"}
                      </td>
                      <td className="py-2.5">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                            STATUS_CLASS[p.status ?? ""] ?? "bg-surface-2 text-ink-2"
                          }`}
                        >
                          {STATUS_LABEL[p.status ?? ""] ?? p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-black/10 bg-surface p-5 shadow-sm">
            <h2 className="text-sm font-bold text-ink">Recent leads</h2>
            <div className="mt-3 flex flex-col gap-3">
              {leads.length === 0 && <p className="text-sm text-muted">No leads in the last 30 days.</p>}
              {leads.map((l) => (
                <div key={l.id} className="border-b border-black/10 pb-3 last:border-none last:pb-0">
                  <p className="text-sm font-semibold text-ink">{l.name ?? l.email ?? "Unnamed lead"}</p>
                  <p className="text-xs text-muted">
                    {l.source ?? "unknown source"} &middot;{" "}
                    {new Date(l.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
