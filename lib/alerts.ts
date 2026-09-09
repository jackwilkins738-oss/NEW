import { formatGBP } from "@/lib/format";
import { isPastUK } from "@/lib/ukDate";

export type AlertLead = { id: string; name: string | null; email: string | null; status: string; created_at: string };
export type AlertInvoice = {
  id: string;
  client_name: string;
  amount_pence: number;
  due_date: string;
  status: string;
  project_id?: string | null;
};
export type AlertProject = {
  id: string;
  client_name: string;
  target_date: string | null;
  next_visit_at: string | null;
  status: string | null;
  pm?: string | null;
};

export type AlertQuote = {
  id: string;
  client_name: string;
  quote_number: string | null;
  status: string;
  sent_at: string | null;
};
export type AlertVariation = {
  id: string;
  number: string | null;
  project_client_name: string;
  status: string;
  project_id?: string | null;
};
export type AlertProjectBudget = { client_name: string; budget_pence: number; committed_pence: number };
export type AlertReview = {
  id: string;
  customer_name: string;
  project_client_name: string;
  status: string;
  project_id?: string | null;
};

// dueDate/ownerName/projectId are filled in wherever the source record
// actually has them (an invoice's due date, a project's assigned pm) - an
// Action Centre item without a date or owner just leaves those blank
// rather than inventing one, same "don't show unowned metrics" rule the
// ranked risk table follows.
export type Alert = {
  severity: "critical" | "warning" | "info";
  text: string;
  dueDate?: string | null;
  ownerName?: string | null;
  projectId?: string | null;
};

export const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 };

// Shared between the dashboard's own AlertsPanel and the weekly digest
// email (app/api/cron/weekly-digest/route.ts) - one definition of "needs
// attention", so the email can never say something different from what
// the dashboard itself shows. The trailing params default to empty so
// existing call sites don't have to change to keep compiling.
export function buildAlerts(
  leads: AlertLead[],
  invoices: AlertInvoice[],
  projects: AlertProject[],
  quotes: AlertQuote[] = [],
  variations: AlertVariation[] = [],
  projectBudgets: AlertProjectBudget[] = [],
  pendingReviews: AlertReview[] = []
): Alert[] {
  const alerts: Alert[] = [];
  const now = Date.now();
  const pmByProjectId = new Map(projects.map((p) => [p.id, p.pm ?? null]));

  for (const l of leads) {
    if (l.status !== "new") continue;
    const ageHours = (now - new Date(l.created_at).getTime()) / 3_600_000;
    if (ageHours >= 24) {
      alerts.push({
        severity: "warning",
        text: `${l.name || l.email || "A lead"} hasn't been followed up on (${Math.floor(ageHours / 24)}d)`,
      });
    }
  }

  for (const inv of invoices) {
    if (inv.status === "paid") continue;
    if (isPastUK(inv.due_date)) {
      alerts.push({
        severity: "critical",
        text: `${inv.client_name}'s invoice is overdue (${formatGBP(inv.amount_pence)})`,
        dueDate: inv.due_date,
        projectId: inv.project_id ?? null,
        ownerName: inv.project_id ? (pmByProjectId.get(inv.project_id) ?? null) : null,
      });
    }
  }

  for (const p of projects) {
    // Only flag "on_track" projects whose date has slipped - at_risk/delayed
    // already signal awareness of a problem, no need to double-flag those.
    if (p.target_date && p.status === "on_track") {
      if (isPastUK(p.target_date)) {
        alerts.push({
          severity: "warning",
          text: `${p.client_name}'s target date has passed but it's still marked on track`,
          dueDate: p.target_date,
          projectId: p.id,
          ownerName: p.pm ?? null,
        });
      }
    }
    if (p.next_visit_at) {
      const visit = new Date(p.next_visit_at);
      const hoursUntil = (visit.getTime() - now) / 3_600_000;
      if (hoursUntil > 0 && hoursUntil <= 48) {
        alerts.push({
          severity: "info",
          text: `Site visit for ${p.client_name} ${
            hoursUntil <= 24 ? "today/tomorrow" : "in the next 2 days"
          } (${visit.toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" })})`,
        });
      }
    }
  }

  for (const q of quotes) {
    if (q.status !== "sent" || !q.sent_at) continue;
    const daysSince = (now - new Date(q.sent_at).getTime()) / 86_400_000;
    if (daysSince >= 4) {
      alerts.push({
        severity: "warning",
        text: `Quote for ${q.client_name}${q.quote_number ? ` (${q.quote_number})` : ""} sent ${Math.floor(daysSince)}d ago with no response`,
      });
    }
  }

  for (const v of variations) {
    if (v.status !== "pending") continue;
    alerts.push({
      severity: "info",
      text: `${v.number ?? "A variation"} for ${v.project_client_name} awaiting approval`,
      projectId: v.project_id ?? null,
      ownerName: v.project_id ? (pmByProjectId.get(v.project_id) ?? null) : null,
    });
  }

  for (const b of projectBudgets) {
    if (b.budget_pence > 0 && b.committed_pence > b.budget_pence) {
      alerts.push({
        severity: "warning",
        text: `${b.client_name} is ${formatGBP(b.committed_pence - b.budget_pence)} over budget`,
      });
    }
  }

  // Not automatic - marking a project complete only logs the request
  // (status "requested"), someone still has to actually send it. This
  // keeps nagging every time alerts are computed until it's sent (or the
  // customer's response is recorded, which flips status to "received").
  for (const r of pendingReviews) {
    if (r.status !== "requested") continue;
    alerts.push({
      severity: "info",
      text: `Review request pending for ${r.customer_name} (${r.project_client_name})`,
      projectId: r.project_id ?? null,
      ownerName: r.project_id ? (pmByProjectId.get(r.project_id) ?? null) : null,
    });
  }

  return alerts.sort((a, b) => {
    const severityDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (severityDiff !== 0) return severityDiff;
    // Within the same severity, the item with the nearest (or most overdue)
    // date leads - an undated item (a stale lead, a pending review) falls
    // to the end of its severity band rather than jumping the queue.
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return 0;
  });
}
