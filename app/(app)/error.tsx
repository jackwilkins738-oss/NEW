"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// Catches anything thrown while rendering a signed-in page - a Supabase
// outage, a malformed row, a failed server action. Without this the error
// escaped all the way to app/global-error.tsx, which replaces the entire
// document: the sidebar disappears and the only way out is the browser's
// back button.
//
// Because it lives inside the (app) route group it renders in the content
// column instead, with the nav still there, so the person can go somewhere
// else or retry without losing the app around them.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="rounded-2xl border border-black/8 bg-surface p-6 shadow-sm">
        <h1 className="font-display text-xl font-extrabold text-ink">Something went wrong</h1>
        <p className="mt-1.5 text-sm text-muted">
          This page couldn&rsquo;t load. It&rsquo;s been reported automatically &mdash; try again, or pick another
          page from the menu.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          {/* reset() re-renders the segment that threw, which is enough for
              anything transient (a dropped connection, a timeout). */}
          <button
            type="button"
            onClick={reset}
            className="btn-primary rounded-lg bg-brand px-3.5 py-2 text-sm font-bold text-white"
          >
            Try again
          </button>
        </div>

        {/* The digest is the only handle that ties what someone saw on screen
            to the stack trace in Sentry, so it's worth showing rather than
            asking them to describe the error. */}
        {error.digest && (
          <p className="mt-4 border-t border-black/8 pt-3 font-mono text-[11px] text-muted">
            Reference: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
