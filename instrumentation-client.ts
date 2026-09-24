import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "@/lib/sentryScrub";

// Client-side counterpart to sentry.server.config.ts / sentry.edge.config.ts -
// same no-op-until-DSN-is-set behaviour, same scrubbing. This is Next.js's
// own file convention (stable since 15.3, loaded automatically, no
// next.config wiring needed), not a Sentry-specific mechanism - deliberately
// not using @sentry/nextjs's withSentryConfig wrapper here either, for the
// same reason as the server/edge configs: that wrapper's build-time
// source-map upload is the part most likely to break a build that can't be
// tested locally on this machine, and isn't needed just to get browser
// errors reported.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  beforeSend: scrubSentryEvent,
});
