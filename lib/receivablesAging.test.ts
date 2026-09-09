import { describe, it, expect } from "vitest";
import { computeReceivablesAging } from "./receivablesAging";

const TODAY = new Date("2026-06-15T12:00:00Z");

describe("computeReceivablesAging", () => {
  it("puts a not-yet-due invoice in the current bucket", () => {
    const r = computeReceivablesAging([{ amount_pence: 10000, paid_pence: 0, due_date: "2026-06-20", status: "unpaid" }], TODAY);
    expect(r.current.totalPence).toBe(10000);
    expect(r.current.count).toBe(1);
    expect(r.totalOutstandingPence).toBe(10000);
  });

  it("puts an invoice due today in the current bucket, not 1-30", () => {
    const r = computeReceivablesAging([{ amount_pence: 10000, paid_pence: 0, due_date: "2026-06-15", status: "unpaid" }], TODAY);
    expect(r.current.totalPence).toBe(10000);
    expect(r.days1to30.totalPence).toBe(0);
  });

  it("buckets 1-30, 31-60, 61-90 and 90+ correctly at the boundaries", () => {
    const r = computeReceivablesAging(
      [
        { amount_pence: 1000, paid_pence: 0, due_date: "2026-05-16", status: "unpaid" }, // 30 days
        { amount_pence: 2000, paid_pence: 0, due_date: "2026-04-16", status: "unpaid" }, // 60 days
        { amount_pence: 3000, paid_pence: 0, due_date: "2026-03-17", status: "unpaid" }, // 90 days
        { amount_pence: 4000, paid_pence: 0, due_date: "2026-01-01", status: "unpaid" }, // >90 days
      ],
      TODAY
    );
    expect(r.days1to30.totalPence).toBe(1000);
    expect(r.days31to60.totalPence).toBe(2000);
    expect(r.days61to90.totalPence).toBe(3000);
    expect(r.over90.totalPence).toBe(4000);
  });

  it("only counts the outstanding balance on a part-paid invoice", () => {
    const r = computeReceivablesAging([{ amount_pence: 10000, paid_pence: 6000, due_date: "2026-05-01", status: "part_paid" }], TODAY);
    expect(r.totalOutstandingPence).toBe(4000);
  });

  it("excludes fully paid invoices", () => {
    const r = computeReceivablesAging([{ amount_pence: 10000, paid_pence: 10000, due_date: "2026-01-01", status: "paid" }], TODAY);
    expect(r.totalOutstandingPence).toBe(0);
  });

  it("excludes a part-paid invoice that has reached zero outstanding", () => {
    const r = computeReceivablesAging([{ amount_pence: 10000, paid_pence: 10000, due_date: "2026-01-01", status: "part_paid" }], TODAY);
    expect(r.totalOutstandingPence).toBe(0);
  });
});
