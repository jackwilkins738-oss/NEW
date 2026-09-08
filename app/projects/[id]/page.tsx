import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { formatGBP } from "@/lib/format";
import { brandThemeStyleTag } from "@/lib/theme";
import { ProjectCostLedger } from "@/components/ProjectCostLedger";
import { VariationsPanel } from "@/components/VariationsPanel";
import { DocumentsPanel } from "@/components/DocumentsPanel";
import { SnagsPanel } from "@/components/SnagsPanel";
import { AssignedTeamPanel } from "@/components/AssignedTeamPanel";
import { CommunicationsPanel } from "@/components/CommunicationsPanel";

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

  const [costItemsRes, quoteRes, variationsRes, invoicesRes, documentsRes, snagsRes, teamRes, projectTeamRes, communicationsRes] =
    await Promise.all([
    supabase
      .from("project_cost_items")
      .select("id, category, description, supplier, amount_pence, status, cost_date, notes")
      .eq("project_id", project.id)
      .order("cost_date", { ascending: false }),
    project.quote_id
      ? supabase.from("quotes").select("line_items").eq("id", project.quote_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("variations")
      .select("id, number, description, materials_cost_pence, labour_cost_pence, other_cost_pence, customer_price_pence, additional_days, status, invoice_id")
      .eq("project_id", project.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("invoices")
      .select("id, milestone, reference, amount_pence, paid_pence, due_date, status")
      .eq("project_id", project.id)
      .order("due_date", { ascending: true }),
    supabase
      .from("project_documents")
      .select("id, storage_path, filename, category, created_at")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("snags")
      .select("id, description, location, assigned_to, due_date, status")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false }),
    supabase.from("team_members").select("id, name, role").eq("tenant_id", tenant.id).order("name", { ascending: true }),
    supabase.from("project_team_members").select("team_member_id").eq("project_id", project.id),
    supabase
      .from("communications")
      .select("id, type, summary, created_at")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false }),
  ]);

  const costItems = costItemsRes.data ?? [];
  const variations = variationsRes.data ?? [];
  const invoices = invoicesRes.data ?? [];
  const quoteLineItems: QuoteLineItem[] = (quoteRes.data?.line_items as QuoteLineItem[] | undefined) ?? [];

  // project-documents is a private bucket (unlike project-photos) - a
  // signed URL, generated through this member's own session so RLS still
  // applies, is what makes each document downloadable rather than a
  // permanent public link.
  const documents = await Promise.all(
    (documentsRes.data ?? []).map(async (doc) => {
      const { data: signed } = await supabase.storage.from("project-documents").createSignedUrl(doc.storage_path, 3600);
      return { ...doc, url: signed?.signedUrl ?? null };
    })
  );
  const snags = snagsRes.data ?? [];
  const team = teamRes.data ?? [];
  const assignedIds = new Set((projectTeamRes.data ?? []).map((r) => r.team_member_id));
  const assignedTeam = team.filter((t) => assignedIds.has(t.id));
  const communications = communicationsRes.data ?? [];

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

        <div className="mt-5 rounded-2xl border border-black/10 bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-bold text-ink">Payment schedule</h2>
          <p className="text-xs text-muted">
            Add or manage these from the Invoices panel on the dashboard - pick this project when adding one.
          </p>
          {invoices.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No invoices raised against this project yet.</p>
          ) : (
            <div className="mt-3 flex flex-col">
              {invoices.map((inv) => {
                const outstanding = inv.amount_pence - (inv.paid_pence ?? 0);
                return (
                  <div key={inv.id} className="flex items-center justify-between gap-3 border-b border-black/10 py-2.5 last:border-none">
                    <p className="text-sm text-ink-2">
                      {inv.milestone ?? inv.reference ?? "Invoice"}
                      <span className="ml-2 text-xs text-muted">
                        due {new Date(inv.due_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                      </span>
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-ink">{formatGBP(inv.amount_pence)}</span>
                      {inv.status === "paid" ? (
                        <span className="text-good">✓</span>
                      ) : inv.status === "part_paid" ? (
                        <span className="text-xs font-semibold text-[#8a5a00]">{formatGBP(outstanding)} left</span>
                      ) : new Date(inv.due_date + "T00:00:00") < new Date() ? (
                        <span className="text-xs font-semibold text-critical">Overdue</span>
                      ) : (
                        <span className="text-xs font-semibold text-muted">Upcoming</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-5">
          <AssignedTeamPanel projectId={project.id} assigned={assignedTeam} available={team} />
        </div>

        <div className="mt-5">
          <VariationsPanel tenantId={tenant.id} projectId={project.id} variations={variations} />
        </div>

        <div className="mt-5">
          <ProjectCostLedger tenantId={tenant.id} projectId={project.id} items={costItems} />
        </div>

        <div className="mt-5">
          <DocumentsPanel tenantId={tenant.id} projectId={project.id} documents={documents} />
        </div>

        <div className="mt-5">
          <SnagsPanel tenantId={tenant.id} projectId={project.id} snags={snags} />
        </div>

        <div className="mt-5">
          <CommunicationsPanel tenantId={tenant.id} projectId={project.id} communications={communications} />
        </div>
      </div>
    </main>
  );
}
