import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { formatGBP } from "@/lib/format";
import { brandThemeStyleTag } from "@/lib/theme";
import { ProjectCostLedger } from "@/components/ProjectCostLedger";

export const dynamic = "force-dynamic";

const CATEGORIES = ["materials", "labour", "subcontractors", "plant", "other"] as const;
const CATEGORY_LABEL: Record<string, string> = {
  materials: "Materials",
  labour: "Labour",
  subcontractors: "Subcontractors",
  plant: "Plant",
  other: "Other",
};

type QuoteLineItem = { category: string; description: string; unit_price_pence: number };

export default async function ProjectPage({ params }: { params: { id: string } }) {
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/login");

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const { data: project } = await supabase
    .from("projects")
    .select(
      "id, ref, client_name, location, project_type, stage, value_pence, pm, start_date, target_date, status, quote_id, created_at"
    )
    .eq("id", params.id)
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (!project) notFound();

  const [costItemsRes, quoteRes] = await Promise.all([
    supabase
      .from("project_cost_items")
      .select("id, category, description, supplier, amount_pence, status, cost_date, notes")
      .eq("project_id", project.id)
      .order("cost_date", { ascending: false }),
    project.quote_id
      ? supabase.from("quotes").select("line_items").eq("id", project.quote_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const costItems = costItemsRes.data ?? [];
  const quoteLineItems: QuoteLineItem[] = (quoteRes.data?.line_items as QuoteLineItem[] | undefined) ?? [];

  const budgetByCategory = new Map<string, number>();
  for (const item of quoteLineItems) {
    budgetByCategory.set(item.category, (budgetByCategory.get(item.category) ?? 0) + item.unit_price_pence);
  }
  const committedByCategory = new Map<string, number>();
  const actualByCategory = new Map<string, number>();
  for (const item of costItems) {
    committedByCategory.set(item.category, (committedByCategory.get(item.category) ?? 0) + item.amount_pence);
    if (item.status === "paid") {
      actualByCategory.set(item.category, (actualByCategory.get(item.category) ?? 0) + item.amount_pence);
    }
  }

  const totalBudget = [...budgetByCategory.values()].reduce((a, b) => a + b, 0);
  const totalCommitted = costItems.reduce((sum, i) => sum + i.amount_pence, 0);
  const totalActual = costItems.filter((i) => i.status === "paid").reduce((sum, i) => sum + i.amount_pence, 0);

  const revenue = project.value_pence ?? 0;
  const projectedProfit = revenue - totalCommitted;
  const projectedMargin = revenue > 0 ? (projectedProfit / revenue) * 100 : null;
  const actualProfit = revenue - totalActual;
  const actualMargin = revenue > 0 ? (actualProfit / revenue) * 100 : null;

  return (
    <main className="min-h-screen bg-page px-6 py-8">
      <style dangerouslySetInnerHTML={{ __html: brandThemeStyleTag(tenant.brand_theme) }} />
      <div className="mx-auto max-w-4xl">
        <Link href="/dashboard" className="text-xs font-semibold text-muted hover:text-brand hover:underline">
          &larr; Back to dashboard
        </Link>

        <header className="mt-3 rounded-2xl border border-black/10 bg-surface px-5 py-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-xs text-muted">{project.ref}</p>
              <h1 className="font-display text-xl font-extrabold text-ink sm:text-2xl">{project.client_name}</h1>
              <p className="mt-1 text-sm text-muted">
                {project.location}
                {project.project_type ? ` · ${project.project_type}` : ""}
                {project.stage ? ` · ${project.stage}` : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono text-2xl font-bold text-ink">
                {project.value_pence != null ? formatGBP(project.value_pence) : "—"}
              </p>
              <p className="text-xs text-muted">
                {project.start_date ?? "no start date"} &rarr; {project.target_date ?? "no end date"}
              </p>
            </div>
          </div>
        </header>

        <div className="mt-5 rounded-2xl border border-black/10 bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-bold text-ink">Budget vs. actual</h2>
          {!project.quote_id && (
            <p className="mt-1 text-xs text-muted">
              This project has no linked quote, so there's no budget figure to compare against - only committed/actual are shown.
            </p>
          )}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-black/10 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  <th className="py-2">Category</th>
                  <th className="py-2 text-right">Budget</th>
                  <th className="py-2 text-right">Committed</th>
                  <th className="py-2 text-right">Actual</th>
                </tr>
              </thead>
              <tbody>
                {CATEGORIES.map((cat) => (
                  <tr key={cat} className="border-b border-black/5 last:border-none">
                    <td className="py-2 text-ink-2">{CATEGORY_LABEL[cat]}</td>
                    <td className="py-2 text-right font-mono text-ink">{formatGBP(budgetByCategory.get(cat) ?? 0)}</td>
                    <td className="py-2 text-right font-mono text-ink">{formatGBP(committedByCategory.get(cat) ?? 0)}</td>
                    <td className="py-2 text-right font-mono text-ink">{formatGBP(actualByCategory.get(cat) ?? 0)}</td>
                  </tr>
                ))}
                <tr className="font-bold text-ink">
                  <td className="py-2">Total</td>
                  <td className="py-2 text-right font-mono">{formatGBP(totalBudget)}</td>
                  <td className="py-2 text-right font-mono">{formatGBP(totalCommitted)}</td>
                  <td className="py-2 text-right font-mono">{formatGBP(totalActual)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-black/10 pt-4 sm:grid-cols-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Revenue</p>
              <p className="mt-0.5 font-mono text-lg font-bold text-ink">{formatGBP(revenue)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Projected profit</p>
              <p className={`mt-0.5 font-mono text-lg font-bold ${projectedProfit >= 0 ? "text-good" : "text-critical"}`}>
                {formatGBP(projectedProfit)}
              </p>
              <p className="text-[10px] text-muted">vs. committed cost</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Actual profit</p>
              <p className={`mt-0.5 font-mono text-lg font-bold ${actualProfit >= 0 ? "text-good" : "text-critical"}`}>
                {formatGBP(actualProfit)}
              </p>
              <p className="text-[10px] text-muted">vs. paid cost only</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Margin</p>
              <p className="mt-0.5 font-mono text-lg font-bold text-ink">
                {projectedMargin != null ? `${projectedMargin.toFixed(1)}%` : "—"}
                {actualMargin != null && <span className="text-sm font-normal text-muted"> ({actualMargin.toFixed(1)}% actual)</span>}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <ProjectCostLedger tenantId={tenant.id} projectId={project.id} items={costItems} />
        </div>
      </div>
    </main>
  );
}
