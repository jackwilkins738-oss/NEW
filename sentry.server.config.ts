import * as Sentry from "@sentry/nextjs";

// No-op with an empty DSN (Sentry.init tolerates this) until
// NEXT_PUBLIC_SENTRY_DSN is actually set - safe to deploy before the
// Sentry project exists.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
});
