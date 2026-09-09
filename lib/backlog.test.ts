import { describe, it, expect } from "vitest";
import { computeBacklogByMonth } from "./backlog";

const TODAY = new Date("2026-06-15T00:00:00Z");

describe("computeBacklogByMonth", () => {
  it("sums total backlog value and count across active projects", () => {
    const s = computeBacklogByMonth(
      [
        { value_pence: 100000, completed_at: null, target_date: "2026-07-01" },
        { value_pence: 200000, completed_at: null, target_date: "2026-08-01" },
      ],
      6,
      TODAY
    );
    expect(s.totalBacklogPence).toBe(300000);
    expect(s.projectCount).toBe(2);
  });

  it("excludes completed projects", () => {
    const s = computeBacklogByMonth(
      [{ value_pence: 100000, completed_at: "2026-01-01T00:00:00Z", target_date: "2026-07-01" }],
      6,
      TODAY
    );
    expect(s.totalBacklogPence).toBe(0);
    expect(s.projectCount).toBe(0);
  });

  it("excludes projects with no value set", () => {
    const s = computeBacklogByMonth([{ value_pence: null, completed_at: null, target_date: "2026-07-01" }], 6, TODAY);
    expect(s.projectCount).toBe(0);
  });

  it("buckets a project into the month of its target date", () => {
    const s = computeBacklogByMonth([{ value_pence: 100000, completed_at: null, target_date: "2026-07-15" }], 6, TODAY);
    const julBucket = s.buckets.find((b) => b.label === "Jul 2026");
    expect(julBucket?.value).toBe(1000);
  });

  it("puts a project with no target date into noTargetDatePence, not a bucket", () => {
    const s = computeBacklogByMonth([{ value_pence: 100000, completed_at: null, target_date: null }], 6, TODAY);
    expect(s.noTargetDatePence).toBe(100000);
    expect(s.buckets.every((b) => b.value === 0)).toBe(true);
  });

  it("folds a target date past the window into a 'Beyond' bucket", () => {
    const s = computeBacklogByMonth([{ value_pence: 100000, completed_at: null, target_date: "2027-06-01" }], 3, TODAY);
    expect(s.buckets.find((b) => b.label === "Beyond")?.value).toBe(1000);
  });

  it("always returns the requested number of monthly buckets even with no data", () => {
    const s = computeBacklogByMonth([], 6, TODAY);
    expect(s.buckets).toHaveLength(6);
    expect(s.buckets[0].label).toBe("Jun 2026");
  });
});
