import { Sparkline } from "@/components/Sparkline";
import { IconUsers, IconBanknote, IconHardHat, IconTrophy } from "@/components/DashboardIcons";
import { TiltCard } from "./TiltCard";

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
      <TiltCard>
        <div
          className="relative overflow-hidden rounded-2xl border p-5"
          style={{
            borderColor: "color-mix(in srgb, var(--brand) 14%, var(--hairline))",
            background: "var(--surface)",
            boxShadow: `0 1px 0 0 var(--card-highlight) inset, 0 1px 2px var(--card-shadow-tight), 0 40px 72px -24px var(--card-shadow-ambient)`,
          }}
        >
          {/* A faint brand-tinted sheen across the top edge - the same "this
              card catches light" cue premium physical products get from a
              studio photo, done in two flat gradients instead of an image. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-16"
            style={{ background: "linear-gradient(180deg, color-mix(in srgb, var(--brand) 7%, transparent), transparent)" }}
          />

          <div className="relative flex items-center justify-between">
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

          <div className="relative mt-4 grid grid-cols-2 divide-x divide-black/8">
            <div className="pr-4">
              <div className="flex items-center gap-1.5 text-muted">
                <IconUsers className="h-3.5 w-3.5" />
                <span className="text-[10px] font-semibold uppercase tracking-wide">Enquiries</span>
              </div>
              <p className="font-display mt-1 text-2xl font-bold text-ink">14</p>
              <Sparkline values={ENQUIRIES} color="var(--brand-strong)" animate />
            </div>
            <div className="pl-4">
              <div className="flex items-center gap-1.5 text-muted">
                <IconBanknote className="h-3.5 w-3.5" />
                <span className="text-[10px] font-semibold uppercase tracking-wide">Pipeline</span>
              </div>
              <p className="font-display mt-1 text-2xl font-bold text-ink">£36.4k</p>
              <Sparkline values={PIPELINE} color="var(--brand)" animate />
            </div>
          </div>

          {/* A second, denser detail row - win rate as a small inline meter
              rather than a third number competing with the two headline
              stats above, so the card reads as more considered without
              reading as more cluttered. */}
          <div className="relative mt-4 flex items-center gap-2 text-xs text-ink-2">
            <IconTrophy className="h-3.5 w-3.5 flex-none text-muted" />
            <span className="flex-none font-semibold">Win rate</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
              <span
                className="sparkline-fade block h-full rounded-full"
                style={{ width: "68%", background: "linear-gradient(90deg, var(--brand), var(--brand-strong))" }}
              />
            </span>
            <span className="flex-none font-mono font-bold text-ink">68%</span>
          </div>

          <div className="relative mt-3 flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-2">
            <IconHardHat className="h-3.5 w-3.5 flex-none [color:var(--brand)]" />
            3 jobs starting this week
          </div>
        </div>
      </TiltCard>

      {/* Second card peeking out behind, for depth - just enough to read as
          "a stack of views", not a second thing competing for attention. */}
      <div
        className="absolute -right-4 -top-4 -z-10 h-full w-full rounded-2xl border border-black/8 opacity-70"
        style={{ background: "var(--surface-2)", transform: "rotate(4deg)" }}
      />
    </div>
  );
}
