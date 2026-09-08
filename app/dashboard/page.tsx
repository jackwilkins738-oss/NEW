import { Suspense } from "react";
import { redirect } from "next/navigation";
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
import { CalendarPanelData } from "@/components/CalendarPanelData";
import { ContactEmailField } from "@/components/ContactEmailField";
import { NavMenu } from "@/components/NavMenu";
import { formatGBP } from "@/lib/format";
import { brandThemeStyleTag } from "@/lib/theme";

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

  const [
    leadsRes,
    pageviewsRes,
    projectsRes,
    invoicesRes,
    tradesRes,
    photosRes,
    quotesRes,
    costItemsRes,
    variationsRes,
    pendingReviewsRes,
  ] = await Promise.all([
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
      .select("id, client_name, reference, milestone, amount_pence, paid_pence, due_date, status")
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
      .select(
        "id, quote_number, client_name, reference, customer_email, customer_phone, line_items, cost_subtotal_pence, markup_percent, vat_rate, vat_amount_pence, total_pence, status, expires_at, deposit_pence, payment_terms, exclusions, terms, accept_token, sent_at, accepted_at, declined_at, created_at"
      )
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("project_cost_items")
      .select("project_id, amount_pence, status")
      .eq("tenant_id", tenant.id),
    supabase
      .from("variations")
      .select("id, number, description, project_id, status")
      .eq("tenant_id", tenant.id)
      .eq("status", "pending"),
    supabase
      .from("reviews")
      .select("id, customer_name, project_id, status")
      .eq("tenant_id", tenant.id)
      .eq("status", "requested"),
  ]);

  const leads = leadsRes.data ?? [];
  const pageviewCount = pageviewsRes.count ?? 0;
  const projects = projectsRes.data ?? [];
  const invoices = invoicesRes.data ?? [];
  const trades = tradesRes.data ?? [];
  const projectPhotos = photosRes.data ?? [];
  const quotes = quotesRes.data ?? [];
  const costItems = costItemsRes.data ?? [];
  const pendingVariations = variationsRes.data ?? [];
  const pendingReviews = pendingReviewsRes.data ?? [];

  const pipelineValue = projects
    .filter((p) => p.status === "on_track" || p.status === "at_risk")
    .reduce((sum, p) => sum + (p.value_pence ?? 0), 0);

  // For the "over budget" alert: budget comes from the originating quote's
  // line items (same source the project detail page uses), committed comes
  // from every cost item regardless of paid/unpaid - a cost is "committed"
  // the moment it's logged, not once it's actually settled.
  const quoteById = new Map(quotes.map((q) => [q.id, q]));
  const committedByProject = new Map<string, number>();
  for (const item of costItems) {
    committedByProject.set(item.project_id, (committedByProject.get(item.project_id) ?? 0) + item.amount_pence);
  }
  const projectBudgets = projects
    .filter((p) => p.quote_id)
    .map((p) => {
      const quote = quoteById.get(p.quote_id!);
      const lineItems = (quote?.line_items ?? []) as { unit_price_pence: number }[];
      const budgetPence = lineItems.reduce((sum, l) => sum + l.unit_price_pence, 0);
      return { client_name: p.client_name, budget_pence: budgetPence, committed_pence: committedByProject.get(p.id) ?? 0 };
    });

  const projectNameById = new Map(projects.map((p) => [p.id, p.client_name]));
  const variationAlerts = pendingVariations.map((v) => ({
    id: v.id,
    number: v.number,
    project_client_name: projectNameById.get(v.project_id) ?? "a project",
    status: v.status,
  }));
  const reviewAlerts = pendingReviews.map((r) => ({
    id: r.id,
    customer_name: r.customer_name,
    project_client_name: r.project_id ? projectNameById.get(r.project_id) ?? "a project" : "a project",
    status: r.status,
  }));

  // "Actual" cost is paid cost items only (see migration 017) - committed-
  // but-unpaid items don't count here, same distinction the project detail
  // page draws between projected and actual profit.
  const actualCostByProject = new Map<string, number>();
  for (const item of costItems) {
    if (item.status !== "paid") continue;
    actualCostByProject.set(item.project_id, (actualCostByProject.get(item.project_id) ?? 0) + item.amount_pence);
  }
  // Only projects with both a value and at least one paid cost count -
  // otherwise every un-costed job would drag this toward a meaningless 100%
  // margin instead of just being left out of the average.
  const costedProjects = projects.filter((p) => p.value_pence != null && (actualCostByProject.get(p.id) ?? 0) > 0);
  const costedRevenue = costedProjects.reduce((sum, p) => sum + (p.value_pence ?? 0), 0);
  const costedActualCost = costedProjects.reduce((sum, p) => sum + (actualCostByProject.get(p.id) ?? 0), 0);
  const grossProfitTracked = costedRevenue - costedActualCost;
  const portfolioMargin = costedRevenue > 0 ? (grossProfitTracked / costedRevenue) * 100 : null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in7Days = new Date(today.getTime() + 7 * 86_400_000);
  const unpaidInvoices = invoices.filter((i) => i.status !== "paid");
  const overdueInvoices = unpaidInvoices.filter((i) => new Date(i.due_date + "T00:00:00") < today);
  const dueSoonInvoices = unpaidInvoices.filter((i) => {
    const due = new Date(i.due_date + "T00:00:00");
    return due >= today && due <= in7Days;
  });
  // amount_pence minus paid_pence, not the full original amount - a
  // part-paid invoice only owes what's left, so overdue/due-soon totals
  // should reflect that rather than the invoice's face value.
  const outstanding = (i: { amount_pence: number; paid_pence: number | null }) => i.amount_pence - (i.paid_pence ?? 0);
  const overdueTotal = overdueInvoices.reduce((sum, i) => sum + outstanding(i), 0);
  const dueSoonTotal = dueSoonInvoices.reduce((sum, i) => sum + outstanding(i), 0);

  const revenueTrend = monthlyValueTrend(projects);
  const projectTypeBreakdown = groupTopN(
    projects,
    (p) => p.project_type ?? "",
    (p) => (p.value_pence ?? 0) / 100,
    "Unspecified"
  );
  const leadSourceBreakdown = groupTopN(leads, (l) => l.source ?? "", () => 1, "Unknown");
  const leadSourceWinRate = winRateBySource(leads);

  // Real revenue, not the "value won" proxy the trend chart uses - actual
  // money that's actually been paid, all-time (there's no paid_at
  // timestamp to window this by date, only a status).
  const revenue = invoices.filter((i) => i.status === "paid").reduce((sum, i) => sum + i.amount_pence, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const wonThisMonth = projects
    .filter((p) => new Date(p.created_at) >= monthStart)
    .reduce((sum, p) => sum + (p.value_pence ?? 0), 0);
  const outstandingTotal = unpaidInvoices.reduce((sum, i) => sum + outstanding(i), 0);
  const quotesAwaitingDecision = quotes.filter((q) => q.status === "sent").length;

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
          <div className="flex items-center gap-2">
            <NavMenu />
            <ContactEmailField tenantId={tenant.id} contactEmail={tenant.contact_email} />
            <form action={signOut}>
              <button className="w-full rounded-lg border border-black/10 bg-surface-2 px-3 py-2.5 text-sm font-semibold text-ink sm:w-auto sm:py-2">
                Sign out
              </button>
            </form>
          </div>
        </header>

        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-black/10 bg-surface p-4 shadow-sm">
            <p className="text-xs font-semibold text-ink-2">Revenue</p>
            <p className="mt-1 font-mono text-xl font-bold text-ink">{formatGBP(revenue)}</p>
          </div>
          <div className="rounded-2xl border border-black/10 bg-surface p-4 shadow-sm">
            <p className="text-xs font-semibold text-ink-2">Won this month</p>
            <p className="mt-1 font-mono text-xl font-bold text-ink">{formatGBP(wonThisMonth)}</p>
          </div>
          <div className="rounded-2xl border border-black/10 bg-surface p-4 shadow-sm">
            <p className="text-xs font-semibold text-ink-2">Outstanding</p>
            <p className={`mt-1 font-mono text-xl font-bold ${outstandingTotal > 0 ? "text-critical" : "text-ink"}`}>
              {formatGBP(outstandingTotal)}
            </p>
          </div>
          <div className="rounded-2xl border border-black/10 bg-surface p-4 shadow-sm">
            <p className="text-xs font-semibold text-ink-2">Quotes awaiting decision</p>
            <p className="mt-1 font-mono text-xl font-bold text-ink">{quotesAwaitingDecision}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-5">
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
          <AlertsPanel
            leads={leads}
            invoices={invoices}
            projects={projects}
            quotes={quotes}
            variations={variationAlerts}
            projectBudgets={projectBudgets}
            pendingReviews={reviewAlerts}
          />
          <CapacityPanel tenantId={tenant.id} trades={trades} />
          <Suspense
            fallback={
              <div className="rounded-2xl border border-black/10 bg-surface p-5 shadow-sm">
                <h2 className="text-sm font-bold text-ink">Your calendar</h2>
                <p className="mt-1 text-sm text-muted">Loading&hellip;</p>
              </div>
            }
          >
            <CalendarPanelData userId={userData.user.id} />
          </Suspense>
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

        {portfolioMargin !== null && (
          <div className="mt-4 rounded-2xl border border-black/10 bg-surface p-5 shadow-sm">
            <p className="text-sm font-semibold text-ink-2">Gross profit tracked</p>
            <p className="mt-1 text-xs text-muted">
              Across {costedProjects.length} project{costedProjects.length === 1 ? "" : "s"} with costs logged
            </p>
            <div className="mt-3 grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Revenue</p>
                <p className="mt-0.5 font-mono text-lg font-bold text-ink">{formatGBP(costedRevenue)}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Actual cost</p>
                <p className="mt-0.5 font-mono text-lg font-bold text-ink">{formatGBP(costedActualCost)}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Margin</p>
                <p className={`mt-0.5 font-mono text-lg font-bold ${portfolioMargin >= 15 ? "text-good" : "text-critical"}`}>
                  {portfolioMargin.toFixed(1)}%
                </p>
              </div>
            </div>
          </div>
        )}

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
            defaultVatRate={tenant.default_vat_rate}
            defaultQuoteTerms={tenant.default_quote_terms}
            defaultPaymentTerms={tenant.default_payment_terms}
          />
        </div>

        <div className="mt-5">
          <InvoicesPanel
            tenantId={tenant.id}
            invoices={invoices}
            projects={projects.map((p) => ({ id: p.id, client_name: p.client_name }))}
            leads={leads.map((l) => ({ id: l.id, name: l.name, email: l.email, status: l.status }))}
          />
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
