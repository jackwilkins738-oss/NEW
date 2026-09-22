// Pure SVG, no client interactivity needed (no hover/tooltip - that's what
// the full RevenueTrend chart further down the page is for) - this is
// purely a glance-able trend indicator sitting inside a KPI tile. Most of
// the line stays in a muted de-emphasis tone; only the final segment and
// end-dot carry the accent colour, so the eye lands on "where things are
// now" rather than the whole trend competing for attention at once.
//
// `animate` (default off, so every existing dashboard usage is unchanged)
// draws the line in on mount via pathLength-normalized stroke-dashoffset -
// used once, on the login page's product preview, where the card is meant
// to feel alive rather than a static screenshot.
export function Sparkline({
  values,
  color = "var(--brand)",
  animate = false,
}: {
  values: number[];
  color?: string;
  animate?: boolean;
}) {
  if (values.length < 2) return null;

  const W = 100;
  const H = 28;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;

  const coords = values.map((v, i) => ({
    x: (i * W) / (values.length - 1),
    y: H - ((v - min) / range) * (H - 4) - 2,
  }));

  const pathFor = (pts: typeof coords) => pts.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");

  const bodyPath = pathFor(coords.slice(0, -1));
  const finalPath = pathFor(coords.slice(-2));
  const areaPath = `${pathFor(coords)} L${coords[coords.length - 1].x.toFixed(1)},${H} L0,${H} Z`;
  const last = coords[coords.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 block w-full" preserveAspectRatio="none" style={{ height: 28 }}>
      <path d={areaPath} fill={color} opacity={0.1} className={animate ? "sparkline-fade" : undefined} />
      <path
        d={bodyPath}
        fill="none"
        stroke="var(--muted)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.6}
        pathLength={animate ? 1 : undefined}
        className={animate ? "sparkline-draw" : undefined}
      />
      <path
        d={finalPath}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={animate ? 1 : undefined}
        className={animate ? "sparkline-draw sparkline-draw-delay" : undefined}
      />
      <circle cx={last.x} cy={last.y} r={2.25} fill={color} className={animate ? "sparkline-fade" : undefined} />
    </svg>
  );
}
