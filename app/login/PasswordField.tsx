"use client";

import { useState } from "react";

// Split out of page.tsx because it's the one piece of the login form that
// needs client interactivity (the show/hide toggle) - everything else stays
// a plain server-rendered form posting to a server action.
export function PasswordField() {
  const [visible, setVisible] = useState(false);

  return (
    <label className="block text-sm font-medium text-ink-2">
      Password
      <div className="relative mt-1.5">
        <svg viewBox="0 0 20 20" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="9" width="12" height="8" rx="1.5" />
          <path d="M6.5 9V6.5a3.5 3.5 0 0 1 7 0V9" />
        </svg>
        <input
          type={visible ? "text" : "password"}
          name="password"
          required
          autoComplete="current-password"
          className="login-input w-full rounded-xl border border-black/15 bg-page py-2.5 pl-9 pr-10 text-base text-ink shadow-[inset_0_1px_2px_rgba(23,20,15,0.04)] outline-none sm:text-sm"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted transition-colors hover:text-ink-2"
        >
          {visible ? (
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2.5 2.5l15 15" />
              <path d="M8.3 4.9A8.8 8.8 0 0 1 10 4.75c5.2 0 8 5.25 8 5.25a14.6 14.6 0 0 1-2.4 3.15M5.6 6.1A14.7 14.7 0 0 0 2 10s2.8 5.25 8 5.25c1 0 1.9-.15 2.7-.45" />
              <path d="M8.3 8.3a2.2 2.2 0 0 0 3.1 3.1" />
            </svg>
          ) : (
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 10s2.8-5.5 8-5.5S18 10 18 10s-2.8 5.5-8 5.5S2 10 2 10z" />
              <circle cx="10" cy="10" r="2.2" />
            </svg>
          )}
        </button>
      </div>
    </label>
  );
}
