"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// Next.js's own convention for catching errors that escape every error
// boundary in the app - not Sentry-specific, just the standard place to
// report them from.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "48px 24px", textAlign: "center" }}>
        <h1 style={{ fontSize: "20px", fontWeight: 700 }}>Something went wrong</h1>
        <p style={{ color: "#666", marginTop: "8px" }}>
          This has been reported. Try refreshing, or come back in a moment.
        </p>
      </body>
    </html>
  );
}
