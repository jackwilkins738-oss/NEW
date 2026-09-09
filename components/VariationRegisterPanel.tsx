import Link from "next/link";
import { type VariationRegisterSummary } from "@/lib/variationRegister";
import { formatGBP } from "@/lib/format";

export function VariationRegisterPanel({ summary }: { summary: VariationRegisterSummary }) {
  const hasAnything = summary.pendingCount > 0 || summary.approvedCount > 0 || summary.declinedCount > 0;

  return (
    <div>
      <h2 className="text-sm font-bold text-ink">Variation register</h2>
      <p className="text-xs text-muted">Extra work requested across every project - what's pending, approved, or declined</p>

      {!hasAnything ? (
        <div className="mt-3 rounded-xl border border-dashed border-black/15 py-6 text-center">
          <p className="text-sm text-muted">No variations recorded yet.</p>
        </div>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-surface-2 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Pending exposure</p>
              <p className="mt-1 font-mono text-lg font-bold text-critical">{formatGBP(summary.pendingValuePence)}</p>
              <p className="text-[10px] text-muted">
                {summary.pendingCount} variation{summary.pendingCount === 1 ? "" : "s"}
              </p>
            </div>
            <div className="rounded-xl bg-surface-2 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Approved value</p>
              <p className="mt-1 font-mono text-lg font-bold text-good">{formatGBP(summary.approvedValuePence)}</p>
              <p className="text-[10px] text-muted">
                {summary.approvedCount} variation{summary.approvedCount === 1 ? "" : "s"}
              </p>
            </div>
            <div className="rounded-xl bg-surface-2 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Avg approval time</p>
              <p className="mt-1 font-mono text-lg font-bold text-ink">
                {summary.avgApprovalDays != null ? `${summary.avgApprovalDays.toFixed(1)}d` : "—"}
              </p>
              <p className="text-[10px] text-muted">
                {summary.declinedCount} declined
              </p>
            </div>
          </div>

          {summary.pendingRows.length > 0 && (
            <div className="mt-4 overflow-x-auto border-t border-black/8 pt-3">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    <th className="py-1.5">Project</th>
                    <th className="py-1.5 text-right">Value</th>
                    <th className="py-1.5 text-right">Waiting</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.pendingRows.map((r) => (
                    <tr key={r.id} className="row-hover border-t border-black/5">
                      <td className="py-2">
                        <Link href={`/projects/${r.projectId}`} className="font-semibold text-ink hover:text-brand hover:underline">
                          {r.projectClientName}
                        </Link>
                        {r.number && <span className="ml-1.5 text-xs text-muted">({r.number})</span>}
                      </td>
                      <td className="py-2 text-right font-mono font-semibold text-ink">{formatGBP(r.valuePence)}</td>
                      <td className={`py-2 text-right text-xs font-semibold ${r.daysWaiting >= 7 ? "text-critical" : "text-muted"}`}>
                        {r.daysWaiting}d
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
