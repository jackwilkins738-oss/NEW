// What makes a new quote quick: lines the business has priced before,
// suggested as they type, and whole quotes (saved templates or past quotes)
// to start from. Pure, so the rules are tested in one place.

export type LibraryLine = { category: string; description: string; unit_price_pence: number };

export type QuoteStart = {
  lines: LibraryLine[];
  markupPercent: number;
  vatRate: number;
  depositPence: number | null;
  paymentTerms: string | null;
  exclusions: string | null;
  terms: string | null;
};

/**
 * Every line priced on a past quote, once each (matched ignoring case and
 * spacing), at the most recent price. `quotes` is newest first, as the
 * dashboard lists them. Blank and zero-price lines are skipped.
 */
export function lineSuggestions(quotes: { line_items: LibraryLine[] | null }[], limit = 300): LibraryLine[] {
  const seen = new Map<string, LibraryLine>();
  for (const q of quotes) {
    for (const line of q.line_items ?? []) {
      const description = (line.description ?? "").replace(/\s+/g, " ").trim();
      if (!description || !(line.unit_price_pence > 0)) continue;
      const key = description.toLowerCase();
      if (!seen.has(key)) seen.set(key, { category: line.category || "other", description, unit_price_pence: line.unit_price_pence });
      if (seen.size >= limit) return [...seen.values()];
    }
  }
  return [...seen.values()];
}

/** The saved line whose description matches what was typed exactly (ignoring case and spacing), if any. */
export function matchSuggestion(suggestions: LibraryLine[], typed: string): LibraryLine | null {
  const key = typed.replace(/\s+/g, " ").trim().toLowerCase();
  if (!key) return null;
  return suggestions.find((s) => s.description.toLowerCase() === key) ?? null;
}

/** A template or past quote as a starting point. Customer details never carry over. */
export function startFrom(source: {
  line_items: LibraryLine[] | null;
  markup_percent: number | null;
  vat_rate: number | null;
  deposit_pence: number | null;
  payment_terms: string | null;
  exclusions: string | null;
  terms: string | null;
}): QuoteStart {
  return {
    lines: (source.line_items ?? []).map((l) => ({
      category: l.category || "other",
      description: l.description ?? "",
      unit_price_pence: Number(l.unit_price_pence) || 0,
    })),
    markupPercent: Number(source.markup_percent) || 0,
    vatRate: source.vat_rate == null ? 20 : Number(source.vat_rate),
    depositPence: source.deposit_pence ?? null,
    paymentTerms: source.payment_terms,
    exclusions: source.exclusions,
    terms: source.terms,
  };
}

/** Details from an enquiry for the top of a quote. The reference is the job type and the address, whichever they gave. */
export function fromEnquiry(lead: {
  name: string | null;
  email: string | null;
  phone: string | null;
  job_type: string | null;
  address: string | null;
}): { clientName: string; customerEmail: string; customerPhone: string; reference: string } {
  return {
    clientName: lead.name?.trim() || lead.email?.trim() || "",
    customerEmail: lead.email?.trim() ?? "",
    customerPhone: lead.phone?.trim() ?? "",
    reference: [lead.job_type?.trim(), lead.address?.trim()].filter(Boolean).join(" - ").slice(0, 200),
  };
}
