import { buildAlerts, type Alert, type AlertLead, type AlertInvoice, type AlertProject } from "@/lib/alerts";

type Lead = AlertLead;
type Invoice = AlertInvoice;
type Project = AlertProject;

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
