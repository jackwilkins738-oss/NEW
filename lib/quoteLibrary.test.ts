import { describe, expect, it } from "vitest";
import { fromEnquiry, lineSuggestions, matchSuggestion, startFrom } from "./quoteLibrary";

const line = (description: string, pounds: number, category = "materials") => ({ category, description, unit_price_pence: pounds * 100 });

describe("lineSuggestions", () => {
  it("offers each line once, at its most recent price, skipping blanks and zeros", () => {
    const quotes = [
      { line_items: [line("Velux window  ", 450), line("", 10), line("Skip hire", 0)] },
      { line_items: [line("velux window", 400), line("Scaffold (per week)", 350, "subcontractors")] },
      { line_items: null },
    ];
    expect(lineSuggestions(quotes)).toEqual([line("Velux window", 450), line("Scaffold (per week)", 350, "subcontractors")]);
  });

  it("stops at the limit", () => {
    const quotes = [{ line_items: Array.from({ length: 10 }, (_, i) => line(`Item ${i}`, 10)) }];
    expect(lineSuggestions(quotes, 3)).toHaveLength(3);
  });

  it("matches what was typed regardless of case and spacing", () => {
    const list = [line("Velux window", 450)];
    expect(matchSuggestion(list, "  VELUX   window ")).toEqual(line("Velux window", 450));
    expect(matchSuggestion(list, "Velux")).toBeNull();
    expect(matchSuggestion(list, "")).toBeNull();
  });
});

describe("starting points", () => {
  it("copies the pricing and wording, never the customer", () => {
    const start = startFrom({
      line_items: [line("Re-felt", 1200, "")],
      markup_percent: 25,
      vat_rate: 0,
      deposit_pence: 30_000,
      payment_terms: "50% up front",
      exclusions: "Guttering",
      terms: null,
    });
    expect(start).toEqual({
      lines: [line("Re-felt", 1200, "other")],
      markupPercent: 25,
      vatRate: 0,
      depositPence: 30_000,
      paymentTerms: "50% up front",
      exclusions: "Guttering",
      terms: null,
    });
    expect(startFrom({ line_items: null, markup_percent: null, vat_rate: null, deposit_pence: null, payment_terms: null, exclusions: null, terms: null }).vatRate).toBe(20);
  });

  it("fills a quote from an enquiry", () => {
    expect(fromEnquiry({ name: " Sarah Kerr ", email: "s@k.co.uk", phone: null, job_type: "Flat roof", address: "12 High St, Guildford" })).toEqual({
      clientName: "Sarah Kerr",
      customerEmail: "s@k.co.uk",
      customerPhone: "",
      reference: "Flat roof - 12 High St, Guildford",
    });
    expect(fromEnquiry({ name: null, email: "s@k.co.uk", phone: null, job_type: null, address: null }).clientName).toBe("s@k.co.uk");
  });
});
