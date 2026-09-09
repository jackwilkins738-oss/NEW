// Turns the raw per-project signals already on the dashboard (overdue
// invoices, budget overrun, pending variations, slipped schedule) into a
// single ranked "what needs attention, and how much is it worth" list -
// same data the flat alert feed already reads, just grouped by project and
// ordered by financial exposure instead of shown as an unordered log.
export type RiskProject = {
  id: string;
  client_name: string;
  status: string | null;
  target_date: string | null;
  completed_at: string | null;
};

export type RiskInvoice = {
  project_id: string | null;
  amount_pence: number;
  paid_pence: number | null;
  due_date: string;
  status: string;
};

export type RiskVariation = {
  project_id: string;
  customer_price_pence: number;
  status: string;
  number: string | null;
};

export type RiskBudget = { project_id: string; budget_pence: number; committed_pence: number };

export type JobRisk = {
  projectId: string;
  clientName: string;
  reasons: string[];
  financialImpactPence: number;
  scheduleImpactDays: number | null;
  severity: "critical" | "warning";
  nextAction: string;
};

export function computeProjectRisks(
  projects: RiskProject[],
  invoices: RiskInvoice[],
  variations: RiskVariation[],
  budgets: RiskBudget[],
  today: Date = new Date()
): JobRisk[] {
  const todayMidnight = new Date(today);
  todayMidnight.setHours(0, 0, 0, 0);

  const overdueByProject = new Map<string, number>();
  for (const inv of invoices) {
    if (!inv.project_id || inv.status === "paid") continue;
    const due = new Date(inv.due_date + "T00:00:00");
    if (due >= todayMidnight) continue;
    const outstanding = inv.amount_pence - (inv.paid_pence ?? 0);
    overdueByProject.set(inv.project_id, (overdueByProject.get(inv.project_id) ?? 0) + outstanding);
  }

  const pendingVariationByProject = new Map<string, { value: number; count: number }>();
  for (const v of variations) {
    if (v.status !== "pending") continue;
    const entry = pendingVariationByProject.get(v.project_id) ?? { value: 0, count: 0 };
    entry.value += v.customer_price_pence;
    entry.count += 1;
    pendingVariationByProject.set(v.project_id, entry);
  }

  const budgetByProject = new Map(budgets.map((b) => [b.project_id, b]));

  const risks: JobRisk[] = [];

  for (const p of projects) {
    if (p.completed_at) continue;

    const reasons: string[] = [];
    let financialImpactPence = 0;
    let scheduleImpactDays: number | null = null;
    let severity: "critical" | "warning" = "warning";
    let nextAction = "";

    const overdue = overdueByProject.get(p.id) ?? 0;
    if (overdue > 0) {
      reasons.push("Overdue invoice");
      financialImpactPence += overdue;
      severity = "critical";
      nextAction = "Chase payment";
    }

    const budget = budgetByProject.get(p.id);
    const overrun = budget && budget.budget_pence > 0 ? budget.committed_pence - budget.budget_pence : 0;
    if (overrun > 0) {
      reasons.push("Over budget");
      financialImpactPence += overrun;
      severity = "critical";
      if (!nextAction) nextAction = "Review cost-to-complete";
    }

    if (p.target_date) {
      const target = new Date(p.target_date + "T00:00:00");
      const daysLate = Math.round((todayMidnight.getTime() - target.getTime()) / 86_400_000);
      if (daysLate > 0 && (p.status === "on_track" || !p.status)) {
        reasons.push("Target date passed");
        scheduleImpactDays = daysLate;
        if (!nextAction) nextAction = "Update schedule or escalate";
      }
    }
    if (p.status === "at_risk" || p.status === "delayed") {
      reasons.push(p.status === "delayed" ? "Marked delayed" : "Marked at risk");
      if (!nextAction) nextAction = "Update schedule or escalate";
    }

    const pendingVariation = pendingVariationByProject.get(p.id);
    if (pendingVariation && pendingVariation.count > 0) {
      reasons.push(`${pendingVariation.count} variation${pendingVariation.count === 1 ? "" : "s"} awaiting approval`);
      financialImpactPence += pendingVariation.value;
      if (!nextAction) nextAction = "Approve or decline variation";
    }

    if (reasons.length === 0) continue;

    risks.push({
      projectId: p.id,
      clientName: p.client_name,
      reasons,
      financialImpactPence,
      scheduleImpactDays,
      severity,
      nextAction,
    });
  }

  return risks.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
    return b.financialImpactPence - a.financialImpactPence;
  });
}
