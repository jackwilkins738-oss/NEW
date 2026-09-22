"use client";

import { useRef } from "react";

// A couple of degrees of mouse-tracked tilt on the dashboard preview card -
// the one place on this page it's worth spending on, since it's the single
// element meant to look like a real, touchable product rather than a static
// screenshot. Pointer-fine only (a phone getting this from its accelerometer
// would feel like a bug, not a feature) and capped low enough that it reads
// as "responsive surface" rather than "gimmick" - matching the brand
// direction's instruction to avoid anything trend-chasing or attention-
// seeking for its own sake.
export function TiltCard({ children }: { children: React.ReactNode }) {
  const innerRef = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);

  function handleMove(e: React.PointerEvent) {
    if (e.pointerType !== "mouse") return;
    const el = innerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      el.style.transform = `rotate(-2deg) rotateX(${(-py * 6).toFixed(2)}deg) rotateY(${(px * 8).toFixed(2)}deg)`;
    });
  }

  function reset() {
    const el = innerRef.current;
    if (!el) return;
    if (frame.current) cancelAnimationFrame(frame.current);
    el.style.transform = "rotate(-2deg)";
  }

  return (
    <div className="login-tilt-perspective" onPointerMove={handleMove} onPointerLeave={reset}>
      <div ref={innerRef} className="login-tilt-inner" style={{ transform: "rotate(-2deg)" }}>
        {children}
      </div>
    </div>
  );
}
