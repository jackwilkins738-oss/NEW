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
