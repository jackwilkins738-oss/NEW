import { type ReceivablesAging } from "@/lib/receivablesAging";
import { formatGBP } from "@/lib/format";

const BUCKET_TONE: Record<string, string> = {
  "Not yet due": "text-ink-2",
  "1-30 days": "text-[#8a5a00]",
  "31-60 days": "text-[#8a5a00]",
  "61-90 days": "text-critical",
  "90+ days": "text-critical",
};

export function ReceivablesAgingPanel({ aging }: { aging: ReceivablesAging }) {
  const buckets = [aging.current, aging.days1to30, aging.days31to60, aging.days61to90, aging.over90];
  const max = Math.max(1, ...buckets.map((b) => b.totalPence));

  return (
    <div className="kpi-tile rounded-2xl border border-black/8 bg-surface p-5 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-ink-2">Receivables ageing</p>
        <p className="font-mono text-sm font-bold text-ink">{formatGBP(aging.totalOutstandingPence)}</p>
      </div>
      <p className="text-xs text-muted">Every unpaid or part-paid invoice, by how overdue it is</p>

      <div className="mt-4 grid grid-cols-5 gap-2">
        {buckets.map((b) => (
          <div key={b.label} className="flex flex-col items-center gap-1.5">
            <div className="flex h-16 w-full items-end overflow-hidden rounded-[4px] bg-surface-2">
              <div
                className="w-full rounded-t-[4px]"
                style={{
                  height: `${b.totalPence > 0 ? Math.max(6, (b.totalPence / max) * 100) : 0}%`,
                  background: b.label === "Not yet due" ? "var(--status-good)" : "var(--status-critical)",
                  opacity: b.label === "1-30 days" || b.label === "31-60 days" ? 0.6 : 1,
                }}
              />
            </div>
            <p className={`font-mono text-xs font-bold ${BUCKET_TONE[b.label]}`}>{formatGBP(b.totalPence)}</p>
            <p className="text-center text-[10px] leading-tight text-muted">{b.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
