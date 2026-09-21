"use client";

import { useEffect, useState } from "react";

export type ThemeChoice = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "loft-theme";

// Applies a choice by setting (or clearing) data-theme on <html>. Clearing it
// hands control back to the @media (prefers-color-scheme) rules in
// globals.css, which is what "system" means.
function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
}

const OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "system", label: "Auto" },
  { value: "dark", label: "Dark" },
];

export function ThemeToggle() {
  // Starts as null rather than "system" so the first paint doesn't assert a
  // choice the viewer hasn't made - see `mounted` below.
  const [choice, setChoice] = useState<ThemeChoice | null>(null);

  useEffect(() => {
    let stored: string | null = null;
    // Reading localStorage throws in a private window with site data blocked,
    // and the toggle must not take the sidebar down with it.
    try {
      stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      stored = null;
    }
    setChoice(stored === "light" || stored === "dark" ? stored : "system");
  }, []);

  function choose(next: ThemeChoice) {
    setChoice(next);
    apply(next);
    try {
      if (next === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
      else window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Preference just won't survive a reload - the page still switches.
    }
  }

  // Render the control only once the stored choice is known. Before that
  // there's no correct segment to highlight, and guessing produces a visible
  // flicker as it corrects itself on hydration.
  if (choice === null) return <div className="h-[30px]" aria-hidden />;

  return (
    <div className="px-3">
      <div
        role="radiogroup"
        aria-label="Colour theme"
        className="flex items-center gap-0.5 rounded-lg bg-white/5 p-0.5"
      >
        {OPTIONS.map(({ value, label }) => {
          const active = choice === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => choose(value)}
              className={`flex-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${
                active ? "bg-white/15 text-white" : "text-white/50 hover:text-white/80"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
