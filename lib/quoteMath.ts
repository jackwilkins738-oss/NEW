// Pulled out of app/dashboard/actions.ts so this money math is testable in
// isolation - a "use server" file's exports all have to be async functions
// (Next.js's own rule for server actions), so these plain sync helpers
// couldn't live there and still be importable from a test.
export const QUOTE_LINE_CATEGORIES = ["materials", "labour", "subcontractors", "other"];

export type QuoteLineItem = { category: string; description: string; unit_price_pence: number };

export function parseLineItems(raw: string): QuoteLineItem[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((l) => ({
        category: QUOTE_LINE_CATEGORIES.includes(l?.category) ? l.category : "other",
        description: String(l?.description ?? "").trim(),
        unit_price_pence: Number.isFinite(l?.unit_price_pence) ? Math.round(l.unit_price_pence) : 0,
      }))
      .filter((l) => l.description || l.unit_price_pence > 0);
  } catch {
    return [];
  }
}

// Cost -> markup -> VAT -> total, matching how a trade quote is actually
// built up rather than one flat sale price entered by hand.
export function computeQuoteTotals(lineItems: QuoteLineItem[], markupPercent: number, vatRate: number) {
  const costSubtotalPence = lineItems.reduce((sum, l) => sum + l.unit_price_pence, 0);
  const saleSubtotalPence = Math.round(costSubtotalPence * (1 + markupPercent / 100));
  const vatAmountPence = Math.round(saleSubtotalPence * (vatRate / 100));
  const totalPence = saleSubtotalPence + vatAmountPence;
  return { costSubtotalPence, vatAmountPence, totalPence };
}
