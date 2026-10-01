import { describe, expect, it } from "vitest";
import { chosenExtras, extraWithVat, parseExtras, withExtras } from "./quoteExtras";

const BUILD = { category: "other", description: "The Scalar build", unit_price_pence: 250_000 };

describe("quote extras", () => {
  it("keeps only sensible extras", () => {
    const parsed = parseExtras([
      { description: " Extra page ", price_pence: 15_000 },
      { description: "", price_pence: 100 },
      { description: "Free?", price_pence: 0 },
      { description: "Typo", price_pence: 99_999_999 },
      "junk",
    ]);
    expect(parsed).toEqual([{ description: "Extra page", price_pence: 15_000 }]);
    expect(parseExtras(null)).toEqual([]);
    expect(parseExtras(Array.from({ length: 12 }, (_, i) => ({ description: `x${i}`, price_pence: 100 })))).toHaveLength(8);
  });

  it("only picks extras that are on the quote", () => {
    const extras = parseExtras([{ description: "A", price_pence: 100 }, { description: "B", price_pence: 200 }]);
    expect(chosenExtras(extras, [1, 1, 7, -1, "0", 0.5])).toEqual([{ description: "B", price_pence: 200 }]);
    expect(chosenExtras(extras, "all")).toEqual([]);
  });

  it("adds the chosen extras to the total, VAT and deposit", () => {
    const q = { line_items: [BUILD], markup_percent: 0, vat_rate: 0, total_pence: 250_000, deposit_pence: 125_000 };
    const out = withExtras(q, [{ description: "Extra page", price_pence: 15_000 }])!;
    expect(out.total_pence).toBe(265_000);
    expect(out.deposit_pence).toBe(132_500); // still half
    expect(out.line_items.map((l) => l.description)).toEqual(["The Scalar build", "Extra page"]);
    expect(withExtras(q, [])).toBeNull();

    const vat = withExtras({ ...q, vat_rate: 20, total_pence: 300_000, deposit_pence: null }, [{ description: "Logo", price_pence: 25_000 }])!;
    expect(vat.total_pence).toBe(330_000);
    expect(vat.vat_amount_pence).toBe(55_000);
    expect(vat.deposit_pence).toBeNull();
    expect(extraWithVat({ description: "Logo", price_pence: 25_000 }, 20)).toBe(30_000);
  });

  it("charges the extra's price even on a quote with markup", () => {
    const q = { line_items: [{ ...BUILD, unit_price_pence: 100_000 }], markup_percent: 25, vat_rate: 0, total_pence: 125_000, deposit_pence: null };
    expect(withExtras(q, [{ description: "Gutter clean", price_pence: 10_000 }])!.total_pence).toBe(135_000);
  });
});
