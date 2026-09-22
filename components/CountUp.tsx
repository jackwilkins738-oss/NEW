"use client";

import { useEffect, useRef, useState } from "react";

// Animates a KPI number counting up from 0 on first paint - purely a "this
// number just loaded and mattered enough to notice" cue, not a data
// visualization. Renders the final `formatted` string immediately for
// prefers-reduced-motion and for the very first server-rendered paint
// (avoids a flash of "0" before hydration), then counts up once mounted.
export function CountUp({ value, formatted, durationMs = 900 }: { value: number; formatted: string; durationMs?: number }) {
  const [display, setDisplay] = useState(formatted);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const start = performance.now();
    let frame: number;

    function tick(now: number) {
      const t = Math.min(1, (now - start) / durationMs);
      // Ease-out cubic - starts fast, settles gently rather than a linear
      // mechanical count.
      const eased = 1 - Math.pow(1 - t, 3);
      const current = value * eased;
      setDisplay(formatValueLike(formatted, current));
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        setDisplay(formatted);
      }
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, formatted, durationMs]);

  return <>{display}</>;
}

// Re-applies whatever non-digit formatting the final string carries (£,
// commas, k-suffix, % ...) to an interpolated number, so a tile showing
// "£36.4k" counts up through "£12.1k", "£24.8k", etc. rather than jumping
// from a bare "0" to a fully-formatted final value.
function formatValueLike(template: string, n: number): string {
  const hasK = /k$/i.test(template.trim());
  const prefix = template.match(/^[^\d]*/)?.[0] ?? "";
  const suffix = hasK ? "k" : template.match(/[^\d.]*$/)?.[0] ?? "";
  const decimals = hasK || /\./.test(template) ? 1 : 0;
  const num = hasK ? n / 1000 : n;
  const body = decimals ? num.toFixed(decimals) : Math.round(num).toLocaleString("en-GB");
  return `${prefix}${body}${suffix}`;
}
