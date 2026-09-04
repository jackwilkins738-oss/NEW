"use client";

import * as Sentry from "@sentry/nextjs";

// Runs once when this client module first loads in the browser (module-
// scope code executes on import, not on render) - simpler and more
// version-agnostic than relying on @sentry/nextjs's automatic client-config
// auto-loading, which normally requires the withSentryConfig webpack
// wrapper this project deliberately isn't using.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
});

export function SentryInit() {
  return null;
}
