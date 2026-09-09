import Link from "next/link";
import { type JobRisk } from "@/lib/projectRisk";
import { formatGBP } from "@/lib/format";

const SEVERITY_CLASS: Record<JobRisk["severity"], string> = {
  critical: "bg-[rgba(208,59,59,0.12)] text-critical",
  warning: "bg-[rgba(250,178,25,0.2)] text-[#8a5a00]",
};

const SEVERITY_LABEL: Record<JobRisk["severity"], string> = {
  critical: "Critical",
  warning: "Watch",
};

export function JobsAtRiskPanel({ risks }: { risks: JobRisk[] }) {
  if (risks.length === 0) {
    return (
      <div className="rounded-2xl border border-black/8 bg-surface p-5 shadow-sm lg:col-span-3">
        <h2 className="text-sm font-bold text-ink">Projects at risk</h2>
        <p className="text-xs text-muted">Ranked by financial exposure - the jobs that need a decision first</p>
        <div className="mt-3 rounded-xl border border-dashed border-black/15 py-6 text-center">
          <p className="text-sm text-muted">No projects flagged - nothing overdue, over budget, or slipping.</p>
        </div>
      </div>
    );
  }

  const totalExposure = risks.reduce((sum, r) => sum + r.financialImpactPence, 0);

  return (
    <div className="rounded-2xl border border-black/8 bg-surface p-5 shadow-sm lg:col-span-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-ink">Projects at risk</h2>
          <p className="text-xs text-muted">Ranked by financial exposure - the jobs that need a decision first</p>
        </div>
        <p className="font-mono text-sm font-bold text-critical">{formatGBP(totalExposure)} exposed</p>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-black/8 text-left text-xs font-semibold uppercase tracking-wide text-muted">
              <th className="py-2">Project</th>
              <th className="py-2">Risk</th>
              <th className="py-2 text-right">Financial impact</th>
              <th className="py-2 text-right">Schedule</th>
              <th className="py-2">Next action</th>
            </tr>
          </thead>
          <tbody>
            {risks.map((r) => (
              <tr key={r.projectId} className="row-hover border-b border-black/5 align-top last:border-none">
                <td className="py-2.5 pr-3">
                  <Link href={`/projects/${r.projectId}`} className="font-semibold text-ink hover:text-brand hover:underline">
                    {r.clientName}
                  </Link>
                  <span className={`ml-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${SEVERITY_CLASS[r.severity]}`}>
                    {SEVERITY_LABEL[r.severity]}
                  </span>
                </td>
                <td className="py-2.5 pr-3 text-xs text-ink-2">{r.reasons.join(" · ")}</td>
                <td className="py-2.5 pr-3 text-right font-mono font-semibold text-ink">
                  {r.financialImpactPence > 0 ? formatGBP(r.financialImpactPence) : "—"}
                </td>
                <td className="py-2.5 pr-3 text-right text-xs text-ink-2">
                  {r.scheduleImpactDays != null ? `${r.scheduleImpactDays}d late` : "—"}
                </td>
                <td className="py-2.5 text-xs font-semibold text-brand-strong">{r.nextAction}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
