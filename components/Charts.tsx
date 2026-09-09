"use client";

import { useState } from "react";

// formatValue used to be passed in as a function prop from the server
// component - but Server Components can only pass serializable data to
// Client Components, not plain functions, which threw a server-side
// exception in production. A "gbp" | "count" string is serializable, so
// the actual Intl formatting lives here instead.
type Format = "gbp" | "count" | "percent";

function formatValue(format: Format, value: number) {
  if (format === "gbp") {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      maximumFractionDigits: 0,
    }).format(value);
  }
  if (format === "percent") return `${Math.round(value)}%`;
  return `${value}`;
}

// Shared horizontal bar chart used for both "revenue by project type" and
// "lead source" - same mark spec (thin bars, rounded ends, direct labels,
// hover tooltip) as the original design, just fed different data.
export function BarChart({
  title,
  note,
  rows,
  format,
  colorMode,
}: {
  title: string;
  note?: string;
  rows: { label: string; value: number; detail?: string }[];
  format: Format;
  colorMode: "categorical" | "single";
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...rows.map((r) => r.value));
  const seriesColors = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];

  return (
    <div className="rounded-2xl border border-black/8 bg-surface p-5 shadow-sm">
      <h2 className="text-sm font-bold text-ink">{title}</h2>
      {note && <p className="text-xs text-muted">{note}</p>}
      <div className="mt-4 flex flex-col gap-3">
        {rows.length === 0 && (
          <div className="rounded-xl border border-dashed border-black/15 py-6 text-center">
            <p className="text-sm text-muted">Nothing to show yet - this fills in as data comes through.</p>
          </div>
        )}
        {rows.map((r, i) => {
          const color =
            colorMode === "categorical"
              ? i < 4
                ? seriesColors[i]
                : "var(--series-other)"
              : "var(--brand)";
          return (
            <div
              key={r.label}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? null : h))}
              className="cursor-default"
            >
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-semibold text-ink-2">{r.label}</span>
                <span className="font-mono text-xs font-semibold text-ink">{formatValue(format, r.value)}</span>
              </div>
              <div className="h-[18px] w-full overflow-hidden rounded-[4px] bg-surface-2">
                <div
                  className="h-full rounded-[4px] transition-opacity"
                  style={{
                    width: `${Math.max(3, (r.value / max) * 100)}%`,
                    background: color,
                    opacity: hover === null || hover === i ? 1 : 0.55,
                  }}
                />
              </div>
              {hover === i && r.detail && <p className="mt-1 text-xs text-muted">{r.detail}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Monthly value trend as a line + area chart, trailing 12 months.
export function RevenueTrend({
  title,
  note,
  points,
  format,
}: {
  title: string;
  note?: string;
  points: { label: string; value: number }[];
  format: Format;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 620;
  const H = 180;
  const padL = 4;
  const padR = 4;
  const top = 14;
  const bottom = 176;

  const values = points.map((p) => p.value);
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const range = max - min || 1;

  const coords = points.map((p, i) => {
    const x = padL + (i * (W - padL - padR)) / Math.max(1, points.length - 1);
    const y = bottom - ((p.value - min) / range) * (bottom - top);
    return { x, y, ...p };
  });

  // Smooth curve through the points (Catmull-Rom converted to cubic
  // bezier segments) instead of straight line segments between them -
  // this alone is most of what separates a "spreadsheet export" line
  // chart from something that reads as considered.
  const linePath = coords
    .map((c, i) => {
      if (i === 0) return `M${c.x},${c.y}`;
      const p0 = coords[Math.max(0, i - 2)];
      const p1 = coords[i - 1];
      const p2 = c;
      const p3 = coords[Math.min(coords.length - 1, i + 1)];
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      return `C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    })
    .join(" ");
  const areaPath = `${linePath} L${coords[coords.length - 1]?.x ?? 0},${bottom} L${coords[0]?.x ?? 0},${bottom} Z`;
  const total = values.reduce((a, b) => a + b, 0);
  const gradientId = `revenue-trend-fill-${title.replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <div className="rounded-2xl border border-black/8 bg-surface p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-ink">{title}</h2>
          {note && <p className="text-xs text-muted">{note}</p>}
        </div>
        <p className="whitespace-nowrap text-sm font-bold text-ink">{formatValue(format, total)} total</p>
      </div>

      {points.length === 0 ? (
        <p className="mt-6 text-sm text-muted">No data yet.</p>
      ) : (
        <div className="relative mt-3">
          <svg viewBox={`0 0 ${W} ${H}`} className="block w-full overflow-visible">
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <line x1={padL} y1={top} x2={W - padR} y2={top} stroke="var(--chart-grid)" strokeWidth={1} />
            <line x1={padL} y1={bottom} x2={W - padR} y2={bottom} stroke="var(--chart-grid)" strokeWidth={1} />
            <path d={areaPath} fill={`url(#${gradientId})`} />
            <path d={linePath} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            {coords.map((c, i) => (
              <g key={i}>
                <circle cx={c.x} cy={c.y} r={hover === i ? 5 : 3.5} fill="var(--series-1)" stroke="var(--chart-surface)" strokeWidth={2} />
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={12}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover((h) => (h === i ? null : h))}
                />
              </g>
            ))}
          </svg>
          {/* Real HTML text, not SVG - SVG text scales down with the viewBox on a
              narrow phone screen and becomes unreadably small; this stays a fixed,
              legible size at any container width. */}
          <div className="mt-1 flex justify-between font-mono text-[10px] text-muted">
            {coords
              .filter((_, i) => i % 2 === 0)
              .map((c) => (
                <span key={c.label}>{c.label}</span>
              ))}
          </div>
          {hover !== null && coords[hover] && (
            <div
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg bg-ink px-2.5 py-1.5 text-xs font-semibold text-surface shadow-lg"
              style={{
                left: `${(coords[hover].x / W) * 100}%`,
                top: `${(coords[hover].y / H) * 100 - 2}%`,
              }}
            >
              {coords[hover].label}: {formatValue(format, coords[hover].value)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
