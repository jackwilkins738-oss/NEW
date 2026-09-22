import { Sparkline } from "@/components/Sparkline";
import { IconUsers, IconBanknote, IconHardHat } from "@/components/DashboardIcons";

// A glimpse of the real dashboard, not a decoration invented for this page -
// same KPI-tile shape and the same Sparkline component /dashboard itself
// renders (components/Sparkline.tsx). Numbers are illustrative (this is a
// signed-out page; there's no tenant data to show yet), but the visual
// language is the real one, propped up like a screenshot rather than laid
// flat, so it reads as "here's the product" and not as a stock graphic.
const ENQUIRIES = [3, 5, 4, 7, 6, 9, 8, 11, 10, 14];
const PIPELINE = [18400, 21200, 19800, 24500, 27100, 26300, 31800, 33200, 30900, 36400];

export function DashboardPreview() {
  return (
    <div className="relative w-full max-w-[360px]" aria-hidden="true">
      <div
        className="rounded-2xl border border-black/8 bg-surface p-5 shadow-[0_1px_2px_rgba(23,20,15,0.06),0_32px_64px_-20px_rgba(23,20,15,0.4)]"
        style={{ transform: "rotate(-2deg)" }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ background: "var(--status-good)" }} />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: "var(--status-good)" }} />
            </span>
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
              This week
            </span>
          </div>
          <IconHardHat className="h-4 w-4 text-muted" />
        </div>

        <div className="mt-4 grid grid-cols-2 divide-x divide-black/8">
          <div className="pr-4">
            <div className="flex items-center gap-1.5 text-muted">
              <IconUsers className="h-3.5 w-3.5" />
              <span className="text-[10px] font-semibold uppercase tracking-wide">Enquiries</span>
            </div>
            <p className="font-display mt-1 text-2xl font-bold text-ink">14</p>
            <Sparkline values={ENQUIRIES} color="var(--brand-strong)" />
          </div>
          <div className="pl-4">
            <div className="flex items-center gap-1.5 text-muted">
              <IconBanknote className="h-3.5 w-3.5" />
              <span className="text-[10px] font-semibold uppercase tracking-wide">Pipeline</span>
            </div>
            <p className="font-display mt-1 text-2xl font-bold text-ink">£36.4k</p>
            <Sparkline values={PIPELINE} color="var(--brand)" />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-2">
          <IconHardHat className="h-3.5 w-3.5 flex-none [color:var(--brand)]" />
          3 jobs starting this week
        </div>
      </div>

      {/* Second card peeking out behind, for depth - just enough to read as
          "a stack of views", not a second thing competing for attention. */}
      <div
        className="absolute -right-4 -top-4 -z-10 h-full w-full rounded-2xl border border-black/8 bg-surface-2 opacity-70"
        style={{ transform: "rotate(4deg)" }}
      />
    </div>
  );
}
