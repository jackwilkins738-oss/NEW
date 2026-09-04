// Next.js's own instrumentation hook (stable since 14.0, no special config
// needed) - not Sentry-specific magic, just a place to run setup code once
// per runtime. Deliberately not using @sentry/nextjs's automatic
// build-time webpack integration (source-map upload, org/project auth
// tokens) - that's the part most likely to break a build that can't be
// tested locally on this machine, and isn't needed just to get errors
// reported.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}
