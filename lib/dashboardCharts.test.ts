import { describe, it, expect } from "vitest";
import { monthlyValueTrend, monthlyPaidTrend, winRateBySource, groupTopN } from "./dashboardCharts";

// These bucket relative to "now", so the fixtures are built from the current
// date rather than hard-coded - a fixed date would start failing once it
// drifted out of the rolling 12-month window.
const now = new Date();
const monthsAgo = (n: number) => new Date(now.getFullYear(), now.getMonth() - n, 15).toISOString();

describe("monthlyValueTrend", () => {
  it("returns a rolling 12-month window", () => {
    expect(monthlyValueTrend([])).toHaveLength(12);
  });

  it("converts pence to pounds", () => {
    const [last] = monthlyValueTrend([{ created_at: monthsAgo(0), value_pence: 250_00 }]).slice(-1);
    expect(last.value).toBe(250);
  });

  it("sums several projects into the same month", () => {
    const rows = [
      { created_at: monthsAgo(0), value_pence: 100_00 },
      { created_at: monthsAgo(0), value_pence: 50_00 },
    ];
    expect(monthlyValueTrend(rows).slice(-1)[0].value).toBe(150);
  });

  it("treats a null value as zero rather than NaN", () => {
    expect(monthlyValueTrend([{ created_at: monthsAgo(0), value_pence: null }]).slice(-1)[0].value).toBe(0);
  });

  it("drops anything older than the window instead of folding it into month one", () => {
    const buckets = monthlyValueTrend([{ created_at: monthsAgo(18), value_pence: 900_00 }]);
    expect(buckets.every((b) => b.value === 0)).toBe(true);
  });
});

describe("monthlyPaidTrend", () => {
  const invoice = (status: string, amount: number, ago = 0) => ({
    due_date: monthsAgo(ago),
    amount_pence: amount,
    status,
  });

  it("counts only paid invoices", () => {
    const values = monthlyPaidTrend([invoice("paid", 300_00), invoice("overdue", 999_00)]);
    expect(values.slice(-1)[0]).toBe(300);
  });

  it("returns bare numbers for the sparkline, one per month", () => {
    expect(monthlyPaidTrend([])).toHaveLength(12);
    expect(monthlyPaidTrend([]).every((v) => v === 0)).toBe(true);
  });
});

describe("winRateBySource", () => {
  it("scores won against decided leads only", () => {
    // Two won, one lost, one still open: the open one must not drag the
    // rate down, or a source looks bad purely for having recent volume
    // nobody has worked yet.
    const rows = [
      { source: "google_ads", status: "won" },
      { source: "google_ads", status: "won" },
      { source: "google_ads", status: "lost" },
      { source: "google_ads", status: "new" },
    ];
    const [entry] = winRateBySource(rows);
    expect(entry.value).toBeCloseTo(66.67, 1);
    expect(entry.detail).toBe("2 won of 3 decided");
  });

  it("omits a source with nothing decided yet", () => {
    expect(winRateBySource([{ source: "referral", status: "contacted" }])).toEqual([]);
  });

  it("labels a missing source rather than dropping it", () => {
    expect(winRateBySource([{ source: null, status: "won" }])[0].label).toBe("Unknown");
  });

  it("sorts best-performing first", () => {
    const rows = [
      { source: "weak", status: "won" },
      { source: "weak", status: "lost" },
      { source: "strong", status: "won" },
    ];
    expect(winRateBySource(rows).map((r) => r.label)).toEqual(["strong", "weak"]);
  });
});

describe("groupTopN", () => {
  const rows = [
    { k: "a", v: 10 },
    { k: "b", v: 8 },
    { k: "c", v: 6 },
    { k: "d", v: 4 },
    { k: "e", v: 2 },
    { k: "f", v: 1 },
  ];
  const group = (input: typeof rows) => groupTopN(input, (r) => r.k, (r) => r.v, "Unknown");

  it("keeps the top four and folds the rest into Other", () => {
    expect(group(rows)).toEqual([
      { label: "a", value: 10 },
      { label: "b", value: 8 },
      { label: "c", value: 6 },
      { label: "d", value: 4 },
      { label: "Other", value: 3 },
    ]);
  });

  it("omits Other when nothing is left over", () => {
    const result = group(rows.slice(0, 3));
    expect(result.map((r) => r.label)).toEqual(["a", "b", "c"]);
  });

  it("sums duplicate keys before ranking", () => {
    const result = group([
      { k: "a", v: 1 },
      { k: "a", v: 9 },
      { k: "b", v: 5 },
    ]);
    expect(result[0]).toEqual({ label: "a", value: 10 });
  });

  it("uses the fallback label for an empty key", () => {
    expect(group([{ k: "", v: 3 }])[0].label).toBe("Unknown");
  });
});
