import { redirect } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { getCurrentTenant } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import { BarChart, RevenueTrend } from "@/components/Charts";
import { LeadsPanel } from "@/components/LeadsPanel";
import { InvoicesPanel } from "@/components/InvoicesPanel";
import { QuotesPanel } from "@/components/QuotesPanel";
import { ProjectsPanel } from "@/components/ProjectsPanel";
import { ProjectPhotosPanel } from "@/components/ProjectPhotosPanel";
import { MonthlyHistory } from "@/components/MonthlyHistory";
import { AlertsPanel } from "@/components/AlertsPanel";
import { CapacityPanel } from "@/components/CapacityPanel";
import { CalendarPanel } from "@/components/CalendarPanel";
import { formatGBP } from "@/lib/format";
import { brandThemeStyleTag } from "@/lib/theme";
import { getCalendarConnection, getValidAccessToken } from "@/lib/calendarConnection";
import { listUpcomingEvents } from "@/lib/googleCalendar";

// Leads/projects/invoices change from outside this app (a customer's own
// website, another teammate) - never let Next.js serve a cached snapshot of
// this page.
export const dynamic = "force-dynamic";

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
// Won / (won + lost) per source - leads still open (new/contacted/quoted)
// don't count against a source yet, so this reads as "quality of decided
// leads" rather than penalizing a source for recent volume that hasn't
// been worked yet.
function winRateBySource(leads: { source: string | null; status: string }[]) {
  const totals = new Map<string, { won: number; lost: number }>();
  for (const l of leads) {
    if (l.status !== "won" && l.status !== "lost") continue;
    const key = l.source || "Unknown";
    const entry = totals.get(key) ?? { won: 0, lost: 0 };
    if (l.status === "won") entry.won++;
    else entry.lost++;
    totals.set(key, entry);
  }
  return [...totals.entries()]
    .map(([label, { won, lost }]) => ({
      label,
      value: (won / (won + lost)) * 100,
      detail: `${won} won of ${won + lost} decided`,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
}

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

  const [leadsRes, pageviewsRes, projectsRes, invoicesRes, tradesRes, photosRes, quotesRes] = await Promise.all([
    supabase
      .from("leads")
      .select("id, name, email, phone, source, status, value_pence, created_at")
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
      .select(
        "id, ref, client_name, location, project_type, stage, value_pence, pm, start_date, target_date, next_visit_at, payment_type, notes, status, lead_id, quote_id, created_at"
      )
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("invoices")
      .select("id, client_name, reference, amount_pence, due_date, status")
      .eq("tenant_id", tenant.id)
      .order("due_date", { ascending: true }),
    supabase
      .from("trade_capacity")
      .select("id, trade_name, percent_booked")
      .eq("tenant_id", tenant.id)
      .order("trade_name", { ascending: true }),
    supabase
      .from("project_photos")
      .select("id, storage_path, caption, project_id, created_at")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("quotes")
      .select("id, client_name, reference, line_items, total_pence, status, created_at")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false }),
  ]);

  const leads = leadsRes.data ?? [];
  const pageviewCount = pageviewsRes.count ?? 0;
  const projects = projectsRes.data ?? [];
  const invoices = invoicesRes.data ?? [];
  const trades = tradesRes.data ?? [];
  const projectPhotos = photosRes.data ?? [];
  const quotes = quotesRes.data ?? [];

  // Best-effort: a Google API hiccup (expired grant, rate limit) shouldn't
  // take the whole dashboard down - fall back to "connected, nothing to show"
  // and let the panel's own "Disconnect"/reconnect flow handle real problems.
  const calendarConnection = await getCalendarConnection(userData.user.id);
  let calendarEvents: { id: string; summary: string; start: string; end: string; htmlLink: string }[] = [];
  if (calendarConnection) {
    try {
      const accessToken = await getValidAccessToken(calendarConnection);
      const in14Days = new Date(Date.now() + 14 * 86_400_000);
      calendarEvents = await listUpcomingEvents(accessToken, calendarConnection.google_calendar_id, new Date(), in14Days);
    } catch (err) {
      console.error("Failed to load Google Calendar events:", err);
      Sentry.captureException(err);
    }
  }
  const pipelineValue = projects
    .filter((p) => p.status === "on_track" || p.status === "at_risk")
    .reduce((sum, p) => sum + (p.value_pence ?? 0), 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in7Days = new Date(today.getTime() + 7 * 86_400_000);
  const unpaidInvoices = invoices.filter((i) => i.status !== "paid");
  const overdueInvoices = unpaidInvoices.filter((i) => new Date(i.due_date + "T00:00:00") < today);
  const dueSoonInvoices = unpaidInvoices.filter((i) => {
    const due = new Date(i.due_date + "T00:00:00");
    return due >= today && due <= in7Days;
  });
  const overdueTotal = overdueInvoices.reduce((sum, i) => sum + i.amount_pence, 0);
  const dueSoonTotal = dueSoonInvoices.reduce((sum, i) => sum + i.amount_pence, 0);

  const revenueTrend = monthlyValueTrend(projects);
  const projectTypeBreakdown = groupTopN(
    projects,
    (p) => p.project_type ?? "",
    (p) => (p.value_pence ?? 0) / 100,
    "Unspecified"
  );
  const leadSourceBreakdown = groupTopN(leads, (l) => l.source ?? "", () => 1, "Unknown");
  const leadSourceWinRate = winRateBySource(leads);

  return (
    <main className="min-h-screen bg-page px-6 py-8">
      <style dangerouslySetInnerHTML={{ __html: brandThemeStyleTag(tenant.brand_theme) }} />
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-3 rounded-2xl border border-black/10 bg-surface px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
              Operations &amp; Sales Dashboard
            </p>
            <h1 className="font-display text-xl font-extrabold text-ink sm:text-2xl">
              {tenant.business_name}
            </h1>
          </div>
          <form action={signOut}>
            <button className="w-full rounded-lg border border-black/10 bg-surface-2 px-3 py-2.5 text-sm font-semibold text-ink sm:w-auto sm:py-2">
              Sign out
            </button>
          </form>
        </header>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-5">
          <div className="rounded-2xl border border-black/10 bg-surface p-5 shadow-sm sm:col-span-1">
            <p className="text-sm font-semibold text-ink-2">Leads &middot; last 30 days</p>
            <p className="mt-2 text-3xl font-bold text-ink">{leads.length}</p>
          </div>
          <div className="rounded-2xl border border-black/10 bg-surface p-5 shadow-sm sm:col-span-1">
            <p className="text-sm font-semibold text-ink-2">Page views &middot; last 30 days</p>
            <p className="mt-2 text-3xl font-bold text-ink">{pageviewCount}</p>
          </div>
          {/* The one number worth seeing before any other - brand-tinted and
              larger than its neighbours, not just another identical tile. */}
          <div className="rounded-2xl border border-black/10 bg-brand-tint p-5 shadow-sm sm:col-span-3">
            <p className="text-sm font-semibold text-brand-strong">Live pipeline value</p>
            <p className="mt-2 font-display text-4xl font-extrabold text-ink sm:text-5xl">{formatGBP(pipelineValue)}</p>
            <p className="mt-1 text-xs text-brand-strong">On track + at risk jobs</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
          <AlertsPanel leads={leads} invoices={invoices} projects={projects} />
          <CapacityPanel tenantId={tenant.id} trades={trades} />
          <CalendarPanel connected={!!calendarConnection} events={calendarEvents} />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-[rgba(208,59,59,0.3)] bg-[rgba(208,59,59,0.08)] p-5 shadow-sm">
            <p className="text-sm font-semibold text-critical">Overdue invoices</p>
            <p className="mt-2 text-3xl font-bold text-ink">{formatGBP(overdueTotal)}</p>
            <p className="mt-1 text-xs text-muted">
              {overdueInvoices.length} invoice{overdueInvoices.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="rounded-2xl border border-[rgba(250,178,25,0.4)] bg-[rgba(250,178,25,0.1)] p-5 shadow-sm">
            <p className="text-sm font-semibold text-[#8a5a00]">Due in next 7 days</p>
            <p className="mt-2 text-3xl font-bold text-ink">{formatGBP(dueSoonTotal)}</p>
            <p className="mt-1 text-xs text-muted">
              {dueSoonInvoices.length} invoice{dueSoonInvoices.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <RevenueTrend
              title="Project value won · trailing 12 months"
              note="By month the project was created - an early proxy for revenue until invoicing is wired in"
              points={revenueTrend}
              format="gbp"
            />
          </div>
          <BarChart
            title="Revenue by project type"
            note="Trailing 12 months"
            rows={projectTypeBreakdown}
            format="gbp"
            colorMode="categorical"
          />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <BarChart
            title="Lead source"
            note="Last 30 days &middot; by volume"
            rows={leadSourceBreakdown}
            format="count"
            colorMode="single"
          />
          <BarChart
            title="Win rate by source"
            note="Won vs. lost - leads still in progress aren't counted yet"
            rows={leadSourceWinRate}
            format="percent"
            colorMode="categorical"
          />
        </div>

        <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ProjectsPanel tenantId={tenant.id} projects={projects} />
          </div>

          <LeadsPanel
            leads={leads}
            tenantId={tenant.id}
            convertedLeadIds={projects.map((p) => p.lead_id).filter((id): id is string => !!id)}
          />
        </div>

        <div className="mt-5">
          <ProjectPhotosPanel
            tenantId={tenant.id}
            photos={projectPhotos}
            projects={projects.map((p) => ({ id: p.id, client_name: p.client_name }))}
          />
        </div>

        <div className="mt-5">
          <MonthlyHistory projects={projects} />
        </div>

        <div className="mt-5">
          <QuotesPanel
            tenantId={tenant.id}
            quotes={quotes}
            convertedQuoteIds={projects.map((p) => p.quote_id).filter((id): id is string => !!id)}
          />
        </div>

        <div className="mt-5">
          <InvoicesPanel tenantId={tenant.id} invoices={invoices} />
        </div>

        <footer className="mt-8 flex justify-end">
          <p className="text-xs text-muted">
            Powered by Scalar Digital &middot; <a href="/privacy" className="hover:text-brand hover:underline">Privacy</a> &middot;{" "}
            <a href="/terms" className="hover:text-brand hover:underline">Terms</a>
          </p>
        </footer>
      </div>
    </main>
  );
}
