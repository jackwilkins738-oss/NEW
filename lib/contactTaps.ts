// Taps on a client site's call, WhatsApp and email links (track.js, migration
// 056). Shown as "taps", never "calls": a website can see the tap, not whether
// the call connected.

export type TapCounts = { call: number; whatsapp: number; email: number; total: number };

export function tapCounts(rows: { kind: string | null }[]): TapCounts {
  const c: TapCounts = { call: 0, whatsapp: 0, email: 0, total: 0 };
  for (const r of rows) {
    if (r.kind === "call" || r.kind === "whatsapp" || r.kind === "email") {
      c[r.kind]++;
      c.total++;
    }
  }
  return c;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "12 call taps · 3 WhatsApp · 1 email" - only the kinds that happened. */
export function tapSummary(c: TapCounts): string {
  return [
    c.call ? plural(c.call, "call tap", "call taps") : "",
    c.whatsapp ? `${c.whatsapp} WhatsApp` : "",
    c.email ? plural(c.email, "email", "emails") : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
