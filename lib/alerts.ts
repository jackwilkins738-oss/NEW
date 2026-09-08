import { formatGBP } from "@/lib/format";

export type AlertLead = { id: string; name: string | null; email: string | null; status: string; created_at: string };
export type AlertInvoice = { id: string; client_name: string; amount_pence: number; due_date: string; status: string };
export type AlertProject = {
  id: string;
  client_name: string;
  target_date: string | null;
  next_visit_at: string | null;
  status: string | null;
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
};
export type AlertProjectBudget = { client_name: string; budget_pence: number; committed_pence: number };

export type Alert = { severity: "critical" | "warning" | "info"; text: string };

export const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 };

// Shared between the dashboard's own AlertsPanel and the weekly digest
// email (app/api/cron/weekly-digest/route.ts) - one definition of "needs
// attention", so the email can never say something different from what
// the dashboard itself shows. The last three params default to empty so
// existing call sites don't have to change to keep compiling.
export function buildAlerts(
  leads: AlertLead[],
  invoices: AlertInvoice[],
  projects: AlertProject[],
  quotes: AlertQuote[] = [],
  variations: AlertVariation[] = [],
  projectBudgets: AlertProjectBudget[] = []
): Alert[] {
  const alerts: Alert[] = [];
  const now = Date.now();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

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
    const due = new Date(inv.due_date + "T00:00:00");
    if (due < today) {
      alerts.push({ severity: "critical", text: `${inv.client_name}'s invoice is overdue (${formatGBP(inv.amount_pence)})` });
    }
  }

  for (const p of projects) {
    // Only flag "on_track" projects whose date has slipped - at_risk/delayed
    // already signal awareness of a problem, no need to double-flag those.
    if (p.target_date && p.status === "on_track") {
      const target = new Date(p.target_date + "T00:00:00");
      if (target < today) {
        alerts.push({ severity: "warning", text: `${p.client_name}'s target date has passed but it's still marked on track` });
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
    alerts.push({ severity: "info", text: `${v.number ?? "A variation"} for ${v.project_client_name} awaiting approval` });
  }

  for (const b of projectBudgets) {
    if (b.budget_pence > 0 && b.committed_pence > b.budget_pence) {
      alerts.push({
        severity: "warning",
        text: `${b.client_name} is ${formatGBP(b.committed_pence - b.budget_pence)} over budget`,
      });
    }
  }

  return alerts.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}
