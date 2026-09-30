import { timingSafeEqual } from "crypto";

// Server-to-server auth for the /api/prospects routes: the caller (the
// Scalar website, or the owner's import script) sends
// `Authorization: Bearer <PROSPECTS_API_SECRET>`. Same shape as the cron
// routes' CRON_SECRET check, but compared in constant time - these routes
// are reachable from the public internet rather than only from Vercel's
// scheduler. With the env var unset, every request is refused.
export function hasServiceSecret(request: Request, envName = "PROSPECTS_API_SECRET"): boolean {
  const secret = process.env[envName];
  if (!secret || secret.length < 32) return false;
  const header = request.headers.get("authorization") ?? "";
  const given = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// The cron routes' CRON_SECRET bearer. Unlike a plain `auth !== \`Bearer ${secret}\``
// check, an unset secret refuses every request - otherwise a deployment
// missing the variable (a preview, say) would accept the literal header
// "Bearer undefined" - and the comparison is constant-time. No minimum
// length here, so an existing short secret keeps working.
export function hasCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
