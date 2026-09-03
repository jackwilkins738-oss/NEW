import { redirect } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import { BarChart, RevenueTrend } from "@/components/Charts";

const MONTH_LABEL = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Buckets project value by the month the project was created. This is a
// proxy for "revenue" (there's no invoicing/completion-date table yet), so
// it's deliberately labelled "value won" rather than "revenue" on the chart.
function monthlyValueTrend(projects: { created_at: string; value_pence: number | null }[]) {
  const now = new Date();
  const buckets: { key: string; label: string; value: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: MONTH_LABEL[d.getMonth()], value: 0 });
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const p of projects) {
    const d = new Date(p.created_at);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const bucket = byKey.get(key);
    if (bucket) bucket.value += p.value_pence ?? 0;
  }
  return buckets.map(({ label, value }) => ({ label, value: value / 100 }));
}

// Groups arbitrary rows by a label, sums (or counts) a value, sorts
// descending, and folds anything past the 4th slot into "Other" - keeps
// every bar chart on this page to the same 4-colour-plus-other rule.
function groupTopN<T>(
  rows: T[],
  keyFn: (row: T) => string,
  valueFn: (row: T) => number,
  fallbackLabel: string
) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const key = keyFn(row) || fallbackLabel;
    totals.set(key, (totals.get(key) ?? 0) + valueFn(row));
  }
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 4);
  const rest = sorted.slice(4);
  const restTotal = rest.reduce((sum, [, v]) => sum + v, 0);
  const result = top.map(([label, value]) => ({ label, value }));
  if (restTotal > 0) result.push({ label: "Other", value: restTotal });
  return result;
}

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
      .select("id, ref, client_name, location, project_type, stage, value_pence, pm, target_date, status, created_at")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false }),
  ]);

  const leads = leadsRes.data ?? [];
  const pageviewCount = pageviewsRes.count ?? 0;
  const projects = projectsRes.data ?? [];
  const pipelineValue = projects
    .filter((p) => p.status === "on_track" || p.status === "at_risk")
    .reduce((sum, p) => sum + (p.value_pence ?? 0), 0);

  const revenueTrend = monthlyValueTrend(projects);
  const projectTypeBreakdown = groupTopN(
    projects,
    (p) => p.project_type ?? "",
    (p) => (p.value_pence ?? 0) / 100,
    "Unspecified"
  );
  const leadSourceBreakdown = groupTopN(leads, (l) => l.source ?? "", () => 1, "Unknown");

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

        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <RevenueTrend
              title="Project value won · trailing 12 months"
              note="By month the project was created - an early proxy for revenue until invoicing is wired in"
              points={revenueTrend}
              formatValue={(v) => formatGBP(Math.round(v * 100))}
            />
          </div>
          <BarChart
            title="Revenue by project type"
            note="Trailing 12 months"
            rows={projectTypeBreakdown}
            formatValue={(v) => formatGBP(Math.round(v * 100))}
            colorMode="categorical"
          />
        </div>

        <div className="mt-5 max-w-md">
          <BarChart
            title="Lead source"
            note="Last 30 days"
            rows={leadSourceBreakdown}
            formatValue={(v) => `${v}`}
            colorMode="single"
          />
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

        <footer className="mt-8 flex justify-end">
          <p className="text-xs text-muted">Powered by Scalar Digital</p>
        </footer>
      </div>
    </main>
  );
}
