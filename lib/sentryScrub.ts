import type { ErrorEvent, EventHint } from "@sentry/nextjs";

// sendDefaultPii defaults to false in the SDK already (no IP/cookies
// attached), but that doesn't stop an *error message itself* from
// containing something sensitive - several places in this app build an
// Error from a failed API response's own body text (e.g. lib/stripe.ts's
// `Stripe checkout session failed: ${res.status} ${await res.text()}`),
// which could echo back request data. This is a last-resort net, not a
// substitute for not putting secrets in error messages in the first place.
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const BEARER_RE = /Bearer\s+[A-Za-z0-9._~+/-]+=*/g;
const SECRET_KEY_RE = /\b(sk_live|sk_test|whsec|rk_live|rk_test)_[A-Za-z0-9]+/g;

function scrub(value: string): string {
  return value.replace(EMAIL_RE, "[redacted-email]").replace(BEARER_RE, "Bearer [redacted]").replace(SECRET_KEY_RE, "[redacted-key]");
}

export function scrubSentryEvent(event: ErrorEvent, _hint: EventHint): ErrorEvent {
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = scrub(exception.value);
  }
  if (event.message) event.message = scrub(event.message);
  // No request data is expected here (this app doesn't pass req/res into
  // Sentry manually), but strip it if some future integration starts
  // attaching it - headers/cookies are exactly the kind of thing this
  // should never forward.
  delete event.request;
  return event;
}
