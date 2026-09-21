"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// The error boundary for everything outside the signed-in shell: login,
// password reset, and the public portal / quote / invoice pages a customer
// opens from an email.
//
// Those customer-facing pages are the reason this is worth having. An
// unhandled error there used to fall through to global-error.tsx, whose
// bare system-font message gives someone who was about to approve a
// variation or pay an invoice no reason to believe the business is
// functioning. This at least looks like the rest of the product and tells
// them the problem is on our side, not theirs.
export default function PublicError({
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
    <main className="flex min-h-screen items-center justify-center bg-page px-6 py-12">
      <div className="login-card-enter w-full max-w-md rounded-[28px] border border-black/8 bg-surface p-7 text-center shadow-[0_1px_2px_rgba(23,20,15,0.06),0_28px_56px_-16px_rgba(23,20,15,0.28)] sm:p-9">
        <h1 className="font-display text-2xl font-extrabold text-ink">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted">
          This is a problem on our side, not with your link. It&rsquo;s been reported automatically &mdash;
          please try again in a moment.
        </p>
        <button
          type="button"
          onClick={reset}
          className="btn-primary mt-6 rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-white"
        >
          Try again
        </button>
        {error.digest && <p className="mt-5 font-mono text-[11px] text-muted">Reference: {error.digest}</p>}
      </div>
    </main>
  );
}
