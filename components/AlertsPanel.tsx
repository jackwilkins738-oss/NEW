import Link from "next/link";
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
import type { ScheduleConflict } from "@/lib/scheduleConflicts";

type Lead = AlertLead;
type Invoice = AlertInvoice;
type Project = AlertProject;

const SEVERITY_CLASS: Record<Alert["severity"], string> = {
  critical: "bg-[rgba(208,59,59,0.12)] text-critical",
  warning: "bg-[rgba(250,178,25,0.2)] text-[#8a5a00]",
  info: "bg-surface-2 text-ink-2",
};

function formatAlertDate(isoDate: string) {
  const d = new Date(isoDate.length <= 10 ? `${isoDate}T00:00:00` : isoDate);
  return `Due ${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`;
}

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
  scheduleConflicts = [],
}: {
  leads: Lead[];
  invoices: Invoice[];
  projects: Project[];
  quotes?: AlertQuote[];
  variations?: AlertVariation[];
  projectBudgets?: AlertProjectBudget[];
  pendingReviews?: AlertReview[];
  scheduleConflicts?: ScheduleConflict[];
}) {
  const alerts = buildAlerts(leads, invoices, projects, quotes, variations, projectBudgets, pendingReviews, scheduleConflicts);

  return (
    // Spans the full grid row once there's something real to show - a
    // genuine problem list shouldn't have to compete for space with
    // Capacity/Calendar the way it does when it's empty.
    <div className={`rounded-2xl border border-black/8 bg-surface p-5 shadow-sm ${alerts.length > 0 ? "lg:col-span-3" : ""}`}>
      <h2 className="text-sm font-bold text-ink">Action centre</h2>
      <p className="text-xs text-muted">Ranked by urgency - the owner and date shown are pulled from the linked project</p>
      <div className="mt-3 flex flex-col gap-2">
        {alerts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-black/15 py-6 text-center">
            <p className="text-sm text-muted">Nothing needs attention right now.</p>
          </div>
        ) : (
          alerts.map((a, i) => {
            const meta = [a.ownerName ? `Owner: ${a.ownerName}` : null, a.dueDate ? formatAlertDate(a.dueDate) : null]
              .filter(Boolean)
              .join(" · ");
            const content = (
              <>
                <span aria-hidden className="mt-0.5">
                  <AlertIcon severity={a.severity} />
                </span>
                <span className="flex-1">
                  <span>{a.text}</span>
                  {meta && <span className="mt-0.5 block text-xs opacity-70">{meta}</span>}
                </span>
              </>
            );
            const className = `flex items-start gap-2.5 rounded-lg px-3 py-2 text-sm ${SEVERITY_CLASS[a.severity]}`;
            return a.projectId ? (
              <Link key={i} href={`/projects/${a.projectId}`} className={`${className} hover:opacity-80`}>
                {content}
              </Link>
            ) : (
              <div key={i} className={className}>
                {content}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
