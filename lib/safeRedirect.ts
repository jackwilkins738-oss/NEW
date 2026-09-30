// Where a sign-in link may send someone afterwards: only ever a path on
// this site. "@evil.com", "//evil.com" or "/\\evil.com" appended to our
// origin would otherwise hand a freshly signed-in user to another site.
export function safeNextPath(requested: string | null, fallback = "/dashboard"): string {
  return requested && /^\/(?![/\\])[^@\\]*$/.test(requested) ? requested : fallback;
}
