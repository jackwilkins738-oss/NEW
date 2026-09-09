import { type DataQualityWarning } from "@/lib/dataQuality";

export function DataQualityPanel({ warnings }: { warnings: DataQualityWarning[] }) {
  if (warnings.length === 0) return null;

  return (
    <div className="mt-4 rounded-2xl border border-dashed border-black/15 bg-surface-2/50 p-4">
      <p className="text-xs font-semibold text-muted">Data quality - these gaps mean the figures above are undercounting</p>
      <ul className="mt-2 flex flex-col gap-1">
        {warnings.map((w) => (
          <li key={w.label} className="text-xs text-ink-2">
            <span className="font-mono font-bold text-ink">{w.count}</span> {w.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
