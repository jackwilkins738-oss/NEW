/** The typed name on an acceptance: trimmed, single-spaced, at least two letters. Null if it isn't a name. */
export function cleanSignature(name: unknown): string | null {
  const clean = String(name ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
  return (clean.match(/\p{L}/gu) ?? []).length >= 2 ? clean : null;
}
