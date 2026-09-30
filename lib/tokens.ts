import { timingSafeEqual } from "crypto";

// Compares a stored secret (a quote's accept_token, an invoice's view_token,
// a project's portal_token, an onboarding link's token) with the one in the
// request, in constant time - `!==` stops at the first differing character,
// which in principle lets someone time their way to a token. Anything that
// isn't a non-empty string on both sides is simply a mismatch.
export function tokensMatch(stored: unknown, given: unknown): boolean {
  if (typeof stored !== "string" || typeof given !== "string" || !stored || !given) return false;
  const a = Buffer.from(stored);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}
