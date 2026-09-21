// Pure shaping functions behind the dashboard's charts.
//
// These were declared inline in app/(app)/dashboard/page.tsx, which meant
// the month-bucketing and win-rate arithmetic - the parts most likely to be
// quietly wrong - could only be checked by loading the page and squinting
// at a chart. Out here they are ordinary functions with tests.
//
// Each is exported; the comments explaining *why* each one measures what it
// does came across unchanged from the page.


export const MONTH_LABEL = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Buckets project value by the month the project was created. This is a
// proxy for "revenue" (there's no invoicing/completion-date table yet), so
// it's deliberately labelled "value won" rather than "revenue" on the chart.
export function monthlyValueTrend(projects: { created_at: string; value_pence: number | null }[]) {
  const now = new Date();
  const buckets: { key: string; label: string; value: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: MONTH_LABEL[d.getMonth()], value: 0 });
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const p of projects) {
    const d = new Date(p.created_at);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const bucket = byKey.get(key);
    if (bucket) bucket.value += p.value_pence ?? 0;
  }
  return buckets.map(({ label, value }) => ({ label, value: value / 100 }));
}

// Same bucketing as monthlyValueTrend, but for paid invoices by due_date
// (there's no paid_at timestamp, only status) - feeds the Revenue tile's
// sparkline. A rougher proxy than a true payment-date trend, but the best
// available without adding a new column just for a glance-able chart.
export function monthlyPaidTrend(invoices: { due_date: string; amount_pence: number; status: string }[]) {
  const now = new Date();
  const buckets: { key: string; value: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, value: 0 });
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const inv of invoices) {
    if (inv.status !== "paid") continue;
    const d = new Date(inv.due_date);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const bucket = byKey.get(key);
    if (bucket) bucket.value += inv.amount_pence;
  }
  return buckets.map((b) => b.value / 100);
}

// Groups arbitrary rows by a label, sums (or counts) a value, sorts
// descending, and folds anything past the 4th slot into "Other" - keeps
// every bar chart on this page to the same 4-colour-plus-other rule.
// Won / (won + lost) per source - leads still open (new/contacted/quoted)
// don't count against a source yet, so this reads as "quality of decided
// leads" rather than penalizing a source for recent volume that hasn't
// been worked yet.
export function winRateBySource(leads: { source: string | null; status: string }[]) {
  const totals = new Map<string, { won: number; lost: number }>();
  for (const l of leads) {
    if (l.status !== "won" && l.status !== "lost") continue;
    const key = l.source || "Unknown";
    const entry = totals.get(key) ?? { won: 0, lost: 0 };
    if (l.status === "won") entry.won++;
    else entry.lost++;
    totals.set(key, entry);
  }
  return [...totals.entries()]
    .map(([label, { won, lost }]) => ({
      label,
      value: (won / (won + lost)) * 100,
      detail: `${won} won of ${won + lost} decided`,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
}

export function groupTopN<T>(
  rows: T[],
  keyFn: (row: T) => string,
  valueFn: (row: T) => number,
  fallbackLabel: string
) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const key = keyFn(row) || fallbackLabel;
    totals.set(key, (totals.get(key) ?? 0) + valueFn(row));
  }
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 4);
  const rest = sorted.slice(4);
  const restTotal = rest.reduce((sum, [, v]) => sum + v, 0);
  const result = top.map(([label, value]) => ({ label, value }));
  if (restTotal > 0) result.push({ label: "Other", value: restTotal });
  return result;
}
