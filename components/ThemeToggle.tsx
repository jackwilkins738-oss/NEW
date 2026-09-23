"use client";

import { useEffect, useState } from "react";

// Explicit light/dark override on top of the OS-level prefers-color-scheme
// this app already respects everywhere. Reads/writes localStorage directly
// (see the inline script in app/layout.tsx that applies the stored choice
// before first paint, so there's no flash of the wrong theme) rather than
// going through React state as the source of truth - the DOM attribute is
// the source of truth, this component just reflects and toggles it.
export function ThemeToggle() {
  // Starts "light" to match server-rendered markup exactly (no window
  // access during render, so no hydration mismatch); the effect below
  // corrects it to the real resolved theme right after mount, same as any
  // client-only UI state.
  const [isDark, setIsDark] = useState(false);

  // Reads state an inline pre-hydration script already wrote to the DOM
  // (see app/layout.tsx) - genuinely can't be known during the render that
  // produces the server-matching initial markup the comment above already
  // explains, so there's no synchronous alternative to an effect here.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const stored = document.documentElement.dataset.theme;
    if (stored === "dark") setIsDark(true);
    else if (stored === "light") setIsDark(false);
    else setIsDark(window.matchMedia("(prefers-color-scheme: dark)").matches);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  function apply(next: "light" | "dark") {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("scalar-theme", next);
    } catch {
      // Private browsing / storage disabled - the toggle still works for
      // this page load, it just won't persist across visits.
    }
    setIsDark(next === "dark");
  }

  return (
    <button
      type="button"
      onClick={() => apply(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="flex h-9 w-9 flex-none items-center justify-center rounded-lg text-white/55 transition-colors hover:bg-white/5 hover:text-white"
    >
      {isDark ? (
        <svg viewBox="0 0 20 20" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="10" cy="10" r="4" />
          <path d="M10 1.5v2M10 16.5v2M18.5 10h-2M3.5 10h-2M15.6 4.4l-1.4 1.4M5.8 14.2l-1.4 1.4M15.6 15.6l-1.4-1.4M5.8 5.8L4.4 4.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 20 20" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 11.5A7.5 7.5 0 0 1 8.5 3a7.5 7.5 0 1 0 8.5 8.5z" />
        </svg>
      )}
    </button>
  );
}
