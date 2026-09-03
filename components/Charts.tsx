"use client";

import { useState } from "react";

// formatValue used to be passed in as a function prop from the server
// component - but Server Components can only pass serializable data to
// Client Components, not plain functions, which threw a server-side
// exception in production. A "gbp" | "count" string is serializable, so
// the actual Intl formatting lives here instead.
type Format = "gbp" | "count";

function formatValue(format: Format, value: number) {
  if (format === "gbp") {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      maximumFractionDigits: 0,
    }).format(value);
  }
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
    <div className="rounded-2xl border border-black/10 bg-surface p-5 shadow-sm">
      <h2 className="text-sm font-bold text-ink">{title}</h2>
      {note && <p className="text-xs text-muted">{note}</p>}
      <div className="mt-4 flex flex-col gap-3">
        {rows.length === 0 && <p className="text-sm text-muted">Nothing to show yet.</p>}
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
  const H = 190;
  const padL = 4;
  const padR = 4;
  const top = 14;
  const bottom = 168;

  const values = points.map((p) => p.value);
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const range = max - min || 1;

  const coords = points.map((p, i) => {
    const x = padL + (i * (W - padL - padR)) / Math.max(1, points.length - 1);
    const y = bottom - ((p.value - min) / range) * (bottom - top);
    return { x, y, ...p };
  });

  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x},${c.y}`).join(" ");
  const areaPath = `${linePath} L${coords[coords.length - 1]?.x ?? 0},${bottom} L${coords[0]?.x ?? 0},${bottom} Z`;
  const total = values.reduce((a, b) => a + b, 0);

  return (
    <div className="rounded-2xl border border-black/10 bg-surface p-5 shadow-sm">
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
            <line x1={padL} y1={top} x2={W - padR} y2={top} stroke="var(--chart-grid)" strokeWidth={1} />
            <line x1={padL} y1={bottom} x2={W - padR} y2={bottom} stroke="var(--chart-grid)" strokeWidth={1} />
            <path d={areaPath} fill="var(--series-1)" opacity={0.1} />
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
            <g fontFamily="IBM Plex Mono, monospace" fontSize={10.5} fill="var(--chart-muted)" textAnchor="middle">
              {coords
                .filter((_, i) => i % 2 === 0)
                .map((c) => (
                  <text key={c.label} x={c.x} y={186}>
                    {c.label}
                  </text>
                ))}
            </g>
          </svg>
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
