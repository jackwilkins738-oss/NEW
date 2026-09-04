import { formatGBP } from "@/lib/format";

type Lead = { id: string; name: string | null; email: string | null; status: string; created_at: string };
type Invoice = { id: string; client_name: string; amount_pence: number; due_date: string; status: string };
type Project = {
  id: string;
  client_name: string;
  target_date: string | null;
  next_visit_at: string | null;
  status: string | null;
};

type Alert = { severity: "critical" | "warning" | "info"; text: string };

const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 };

const SEVERITY_CLASS: Record<Alert["severity"], string> = {
  critical: "bg-[rgba(208,59,59,0.12)] text-critical",
  warning: "bg-[rgba(250,178,25,0.2)] text-[#8a5a00]",
  info: "bg-surface-2 text-ink-2",
};

const SEVERITY_ICON: Record<Alert["severity"], string> = {
  critical: "!",
  warning: "!",
  info: "i",
};

// Solid background + white glyph, not the bg-current trick: that only
// works if the icon element's OWN text color is the severity color, but
// this icon's text is white (for the glyph) - bg-current would just
// resolve to white-on-white.
const SEVERITY_ICON_CLASS: Record<Alert["severity"], string> = {
  critical: "bg-critical",
  warning: "bg-warning",
  info: "bg-muted",
};

function buildAlerts(leads: Lead[], invoices: Invoice[], projects: Project[]): Alert[] {
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

  return alerts.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

export function AlertsPanel({ leads, invoices, projects }: { leads: Lead[]; invoices: Invoice[]; projects: Project[] }) {
  const alerts = buildAlerts(leads, invoices, projects);

  return (
    <div className="rounded-2xl border border-black/10 bg-surface p-5 shadow-sm">
      <h2 className="text-sm font-bold text-ink">Needs attention</h2>
      <p className="text-xs text-muted">Pulled automatically from your leads, invoices and projects</p>
      <div className="mt-3 flex flex-col gap-2">
        {alerts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-black/15 py-6 text-center">
            <p className="text-sm text-muted">Nothing needs attention right now.</p>
          </div>
        ) : (
          alerts.map((a, i) => (
            <div key={i} className={`flex items-start gap-2.5 rounded-lg px-3 py-2 text-sm ${SEVERITY_CLASS[a.severity]}`}>
              <span
                aria-hidden
                className={`mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full text-[10px] font-bold text-white ${SEVERITY_ICON_CLASS[a.severity]}`}
              >
                {SEVERITY_ICON[a.severity]}
              </span>
              <span>{a.text}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
