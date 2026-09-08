import {
  buildAlerts,
  type Alert,
  type AlertLead,
  type AlertInvoice,
  type AlertProject,
  type AlertQuote,
  type AlertVariation,
  type AlertProjectBudget,
  type AlertReview,
} from "@/lib/alerts";

type Lead = AlertLead;
type Invoice = AlertInvoice;
type Project = AlertProject;

const SEVERITY_CLASS: Record<Alert["severity"], string> = {
  critical: "bg-[rgba(208,59,59,0.12)] text-critical",
  warning: "bg-[rgba(250,178,25,0.2)] text-[#8a5a00]",
  info: "bg-surface-2 text-ink-2",
};

function AlertIcon({ severity }: { severity: Alert["severity"] }) {
  const shared = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (severity === "info") {
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4 flex-none" {...shared}>
        <circle cx="10" cy="10" r="7.5" />
        <path d="M10 9v4.5" />
        <circle cx="10" cy="6.5" r="0.9" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 flex-none" {...shared}>
      <path d="M10 2.5l8.5 15h-17l8.5-15z" />
      <path d="M10 8v4" />
      <circle cx="10" cy="14.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function AlertsPanel({
  leads,
  invoices,
  projects,
  quotes = [],
  variations = [],
  projectBudgets = [],
  pendingReviews = [],
}: {
  leads: Lead[];
  invoices: Invoice[];
  projects: Project[];
  quotes?: AlertQuote[];
  variations?: AlertVariation[];
  projectBudgets?: AlertProjectBudget[];
  pendingReviews?: AlertReview[];
}) {
  const alerts = buildAlerts(leads, invoices, projects, quotes, variations, projectBudgets, pendingReviews);

  return (
    // Spans the full grid row once there's something real to show - a
    // genuine problem list shouldn't have to compete for space with
    // Capacity/Calendar the way it does when it's empty.
    <div className={`rounded-2xl border border-black/10 bg-surface p-5 shadow-sm ${alerts.length > 0 ? "lg:col-span-3" : ""}`}>
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
              <span aria-hidden className="mt-0.5">
                <AlertIcon severity={a.severity} />
              </span>
              <span>{a.text}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
