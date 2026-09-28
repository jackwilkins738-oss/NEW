import { describe, expect, it } from "vitest";
import { addDays, balanceToInvoice, depositToInvoice } from "./jobs";

describe("what's left to invoice on a job", () => {
  it("is the job's value minus every invoice already raised", () => {
    expect(balanceToInvoice(500_000, [])).toBe(500_000);
    expect(balanceToInvoice(500_000, [{ amount_pence: 100_000 }, { amount_pence: 150_000 }])).toBe(250_000);
    // Approved variations are already in value_pence, so an extra's own invoice is counted once.
    expect(balanceToInvoice(560_000, [{ amount_pence: 100_000 }, { amount_pence: 60_000 }])).toBe(400_000);
  });

  it("never goes negative or breaks on a missing value", () => {
    expect(balanceToInvoice(100_000, [{ amount_pence: 120_000 }])).toBe(0);
    expect(balanceToInvoice(null, [])).toBe(0);
  });

  it("offers the deposit once, and only if the quote asked for one", () => {
    expect(depositToInvoice(50_000, [])).toBe(50_000);
    expect(depositToInvoice(50_000, [{ milestone: "Stage 1" }])).toBe(50_000);
    expect(depositToInvoice(50_000, [{ milestone: "deposit" }])).toBe(0);
    expect(depositToInvoice(null, [])).toBe(0);
    expect(depositToInvoice(0, [])).toBe(0);
  });
});

describe("addDays", () => {
  it("counts calendar days across month and year ends", () => {
    expect(addDays("2026-10-25", 14)).toBe("2026-11-08");
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
  });
});
