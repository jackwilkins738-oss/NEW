import Link from "next/link";
import { type SnagRegisterSummary } from "@/lib/snagRegister";

export function SnagRegisterPanel({ summary }: { summary: SnagRegisterSummary }) {
  const hasAnything = summary.openCount > 0 || summary.completeCount > 0;

  return (
    <div className="rounded-2xl border border-black/8 bg-surface p-5 shadow-sm">
      <h2 className="text-sm font-bold text-ink">Defect register</h2>
      <p className="text-xs text-muted">Open snags across every project, oldest and overdue first</p>

      {!hasAnything ? (
        <div className="mt-3 rounded-xl border border-dashed border-black/15 py-6 text-center">
          <p className="text-sm text-muted">No snags recorded yet.</p>
        </div>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-surface-2 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Open</p>
              <p className="mt-1 font-mono text-lg font-bold text-ink">{summary.openCount}</p>
            </div>
            <div className="rounded-xl bg-surface-2 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Overdue</p>
              <p className={`mt-1 font-mono text-lg font-bold ${summary.overdueCount > 0 ? "text-critical" : "text-ink"}`}>
                {summary.overdueCount}
              </p>
            </div>
            <div className="rounded-xl bg-surface-2 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Unassigned</p>
              <p className={`mt-1 font-mono text-lg font-bold ${summary.unassignedCount > 0 ? "text-[#8a5a00]" : "text-ink"}`}>
                {summary.unassignedCount}
              </p>
            </div>
          </div>

          {summary.openRows.length > 0 && (
            <div className="mt-4 flex flex-col gap-1.5 border-t border-black/8 pt-3">
              {summary.openRows.slice(0, 8).map((r) => (
                <Link
                  key={r.id}
                  href={`/projects/${r.projectId}`}
                  className={`row-hover flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs ${
                    r.overdue ? "bg-[rgba(208,59,59,0.08)]" : ""
                  }`}
                >
                  <span className="text-ink-2">
                    {r.description} <span className="text-muted">&middot; {r.projectClientName}</span>
                  </span>
                  <span className={`flex-none font-semibold ${r.overdue ? "text-critical" : "text-muted"}`}>{r.daysOpen}d</span>
                </Link>
              ))}
              {summary.openRows.length > 8 && (
                <p className="mt-1 text-center text-[10px] text-muted">+{summary.openRows.length - 8} more</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
