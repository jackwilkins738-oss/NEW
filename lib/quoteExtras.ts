import { computeQuoteTotals, type QuoteLineItem } from "@/lib/quoteMath";

// Optional extras on a quote (migration 058). The customer ticks the ones
// they want on the quote page; on acceptance those become ordinary lines, and
// the total, VAT and deposit are worked out again - so what they signed is
// the real price, and the job and invoices follow from it unchanged.

export type QuoteExtra = { description: string; price_pence: number };

export const MAX_EXTRAS = 8;
const MAX_EXTRA_PENCE = 1_000_000; // £10k - anything above is a typo

/** Cleans extras from untrusted input (the API, or the database) - bad entries are dropped. */
export function parseExtras(raw: unknown): QuoteExtra[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e) => ({
      description: typeof e?.description === "string" ? e.description.trim().slice(0, 120) : "",
      price_pence: Number.isFinite(e?.price_pence) ? Math.round(e.price_pence) : 0,
    }))
    .filter((e) => e.description && e.price_pence > 0 && e.price_pence <= MAX_EXTRA_PENCE)
    .slice(0, MAX_EXTRAS);
}

/** The ticked extras, from indexes sent by the browser - anything not on the quote is ignored. */
export function chosenExtras(extras: QuoteExtra[], picked: unknown): QuoteExtra[] {
  if (!Array.isArray(picked)) return [];
  const idx = new Set(picked.filter((i): i is number => Number.isInteger(i) && i >= 0 && i < extras.length));
  return extras.filter((_, i) => idx.has(i));
}

/** An extra's price including VAT - what the customer sees beside its tick box. */
export function extraWithVat(e: QuoteExtra, vatRate: number): number {
  return e.price_pence + Math.round(e.price_pence * (vatRate / 100));
}

type Priced = {
  line_items: QuoteLineItem[];
  markup_percent: number;
  vat_rate: number;
  total_pence: number;
  deposit_pence: number | null;
};

/**
 * The quote with the chosen extras added as lines. Extra prices are sale
 * prices before VAT; lines are costs that the quote's markup is applied to,
 * so each is turned back into a cost first. The deposit keeps the same share
 * of the new total.
 */
export function withExtras(q: Priced, chosen: QuoteExtra[]) {
  if (chosen.length === 0) return null;
  const factor = 1 + (q.markup_percent || 0) / 100;
  const lineItems: QuoteLineItem[] = [
    ...q.line_items,
    ...chosen.map((e) => ({ category: "other", description: e.description, unit_price_pence: Math.round(e.price_pence / factor) })),
  ];
  const totals = computeQuoteTotals(lineItems, q.markup_percent || 0, q.vat_rate);
  const deposit = q.deposit_pence && q.total_pence > 0 ? Math.round((q.deposit_pence * totals.totalPence) / q.total_pence) : q.deposit_pence;
  return {
    line_items: lineItems,
    cost_subtotal_pence: totals.costSubtotalPence,
    vat_amount_pence: totals.vatAmountPence,
    total_pence: totals.totalPence,
    deposit_pence: deposit,
  };
}
