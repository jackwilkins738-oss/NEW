import { describe, it, expect } from "vitest";
import { parseLineItems, computeQuoteTotals } from "./quoteMath";

describe("parseLineItems", () => {
  it("parses a well-formed line item array", () => {
    const items = parseLineItems(JSON.stringify([{ category: "materials", description: "Timber", unit_price_pence: 5000 }]));
    expect(items).toEqual([{ category: "materials", description: "Timber", unit_price_pence: 5000 }]);
  });

  it("falls back an unrecognised category to 'other'", () => {
    const items = parseLineItems(JSON.stringify([{ category: "made-up-category", description: "X", unit_price_pence: 100 }]));
    expect(items[0].category).toBe("other");
  });

  it("drops a row with no description and no price", () => {
    const items = parseLineItems(JSON.stringify([{ category: "materials", description: "", unit_price_pence: 0 }]));
    expect(items).toHaveLength(0);
  });

  it("keeps a row with a price but no description", () => {
    const items = parseLineItems(JSON.stringify([{ category: "materials", description: "", unit_price_pence: 500 }]));
    expect(items).toHaveLength(1);
  });

  it("rounds a non-integer price to the nearest penny", () => {
    const items = parseLineItems(JSON.stringify([{ category: "materials", description: "X", unit_price_pence: 100.6 }]));
    expect(items[0].unit_price_pence).toBe(101);
  });

  it("returns an empty array for invalid JSON instead of throwing", () => {
    expect(parseLineItems("not json")).toEqual([]);
  });

  it("returns an empty array when given a non-array JSON value", () => {
    expect(parseLineItems(JSON.stringify({ not: "an array" }))).toEqual([]);
  });
});

describe("computeQuoteTotals", () => {
  it("computes cost -> markup -> VAT -> total in the right order", () => {
    // £1,000 of costs, 20% markup -> £1,200 sale, 20% VAT -> £240, total £1,440
    const result = computeQuoteTotals([{ category: "materials", description: "X", unit_price_pence: 100000 }], 20, 20);
    expect(result.costSubtotalPence).toBe(100000);
    expect(result.vatAmountPence).toBe(24000);
    expect(result.totalPence).toBe(144000);
  });

  it("handles zero markup and zero VAT (total equals cost)", () => {
    const result = computeQuoteTotals([{ category: "materials", description: "X", unit_price_pence: 50000 }], 0, 0);
    expect(result.totalPence).toBe(50000);
    expect(result.vatAmountPence).toBe(0);
  });

  it("sums multiple line items before applying markup/VAT", () => {
    const result = computeQuoteTotals(
      [
        { category: "materials", description: "A", unit_price_pence: 10000 },
        { category: "labour", description: "B", unit_price_pence: 20000 },
      ],
      0,
      20
    );
    expect(result.costSubtotalPence).toBe(30000);
    expect(result.vatAmountPence).toBe(6000);
    expect(result.totalPence).toBe(36000);
  });

  it("returns zero totals for no line items", () => {
    const result = computeQuoteTotals([], 15, 20);
    expect(result).toEqual({ costSubtotalPence: 0, vatAmountPence: 0, totalPence: 0 });
  });
});
