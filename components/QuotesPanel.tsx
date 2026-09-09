"use client";

import { useMemo, useState, useTransition } from "react";
import { addQuote, updateQuoteStatus, sendQuote, deleteQuote, convertQuoteToProject } from "@/app/dashboard/actions";
import { formatGBP } from "@/lib/format";
import { DeleteButton } from "@/components/DeleteButton";
import { IconDocument } from "@/components/DashboardIcons";
import { PanelSearchInput } from "@/components/PanelSearchInput";
import { PanelPagination } from "@/components/PanelPagination";
import { isPastUK } from "@/lib/ukDate";

const PAGE_SIZE = 20;

type LineItem = { category: string; description: string; unit_price_pence: number };

type Quote = {
  id: string;
  quote_number: string | null;
  client_name: string;
  reference: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  line_items: LineItem[];
  cost_subtotal_pence: number;
  markup_percent: number;
  vat_rate: number;
  vat_amount_pence: number;
  total_pence: number;
  status: string;
  expires_at: string | null;
  deposit_pence: number | null;
  payment_terms: string | null;
  exclusions: string | null;
  terms: string | null;
  accept_token: string;
  sent_at: string | null;
  accepted_at: string | null;
  declined_at: string | null;
  created_at: string;
};

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "accepted", label: "Accepted" },
  { value: "declined", label: "Declined" },
];

const STATUS_CLASS: Record<string, string> = {
  draft: "bg-surface-2 text-ink-2",
  sent: "bg-[rgba(250,178,25,0.25)] text-[#8a5a00]",
  accepted: "bg-[rgba(12,163,12,0.15)] text-good",
  declined: "bg-[rgba(208,59,59,0.15)] text-critical",
};

const CATEGORY_OPTIONS = [
  { value: "materials", label: "Materials" },
  { value: "labour", label: "Labour" },
  { value: "subcontractors", label: "Subcontractors" },
  { value: "other", label: "Other" },
];

// text-base (16px), not text-sm: iOS Safari auto-zooms into any input under
// 16px on focus - matches the field size already used elsewhere.
const field =
  "mt-1 w-full rounded-lg border border-black/15 bg-surface px-2.5 py-2 text-base text-ink outline-none focus:border-brand sm:text-sm";
const label = "text-xs font-semibold text-ink-2";

type DraftLine = { category: string; description: string; amountPounds: string };

function computeTotals(lines: DraftLine[], markupPercent: number, vatRate: number) {
  const costSubtotal = lines.reduce((sum, l) => sum + (Number(l.amountPounds) || 0), 0);
  const saleSubtotal = costSubtotal * (1 + markupPercent / 100);
  const vatAmount = saleSubtotal * (vatRate / 100);
  const total = saleSubtotal + vatAmount;
  return { costSubtotal, saleSubtotal, vatAmount, total };
}

function NewQuoteForm({
  tenantId,
  defaultVatRate,
  defaultQuoteTerms,
  defaultPaymentTerms,
}: {
  tenantId: string;
  defaultVatRate: number;
  defaultQuoteTerms: string | null;
  defaultPaymentTerms: string | null;
}) {
  const [lines, setLines] = useState<DraftLine[]>([{ category: "materials", description: "", amountPounds: "" }]);
  const [markupPercent, setMarkupPercent] = useState("0");
  const [vatRate, setVatRate] = useState(String(defaultVatRate));
  const totals = computeTotals(lines, Number(markupPercent) || 0, Number(vatRate) || 0);

  const updateLine = (i: number, patch: Partial<DraftLine>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const lineItemsJson = JSON.stringify(
    lines.map((l) => ({
      category: l.category,
      description: l.description,
      unit_price_pence: Math.round((Number(l.amountPounds) || 0) * 100),
    }))
  );

  return (
    <form
      action={addQuote}
      className="mt-3 flex flex-col gap-3 rounded-xl border border-black/8 bg-surface-2 p-3"
      onSubmit={() => {
        // The hidden field's value is read by the browser before this fires,
        // so clearing state here is safe - it only resets what's shown next.
        setTimeout(() => {
          setLines([{ category: "materials", description: "", amountPounds: "" }]);
          setMarkupPercent("0");
          setVatRate(String(defaultVatRate));
        }, 0);
      }}
    >
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="lineItems" value={lineItemsJson} />
      <input type="hidden" name="markupPercent" value={markupPercent} />
      <input type="hidden" name="vatRate" value={vatRate} />

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className={label}>
          Client
          <input name="clientName" required className={field} />
        </label>
        <label className={label}>
          Reference
          <input name="reference" className={field} />
        </label>
        <label className={label}>
          Customer email
          <input name="customerEmail" type="email" className={field} placeholder="for sending the quote" />
        </label>
        <label className={label}>
          Customer phone
          <input name="customerPhone" className={field} />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        {lines.map((line, i) => (
          <div key={i} className="grid grid-cols-[120px_1fr_90px_auto] items-end gap-2">
            <label className={label}>
              {i === 0 ? "Category" : ""}
              <select
                value={line.category}
                onChange={(e) => updateLine(i, { category: e.target.value })}
                className={field}
              >
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              {i === 0 ? "Description" : ""}
              <input
                value={line.description}
                onChange={(e) => updateLine(i, { description: e.target.value })}
                placeholder="e.g. Roof re-felt"
                className={field}
              />
            </label>
            <label className={label}>
              {i === 0 ? "Cost £" : ""}
              <input
                type="number"
                min="0"
                step="0.01"
                value={line.amountPounds}
                onChange={(e) => updateLine(i, { amountPounds: e.target.value })}
                className={field}
              />
            </label>
            <button
              type="button"
              onClick={() => setLines((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev))}
              className="min-h-[36px] rounded-lg border border-black/8 px-2 text-xs font-semibold text-ink-2 hover:bg-surface"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setLines((prev) => [...prev, { category: "materials", description: "", amountPounds: "" }])}
          className="self-start text-xs font-semibold text-brand hover:underline"
        >
          + Add line
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className={label}>
          Markup %
          <input
            type="number"
            min="0"
            step="0.1"
            value={markupPercent}
            onChange={(e) => setMarkupPercent(e.target.value)}
            className={field}
          />
        </label>
        <label className={label}>
          VAT %
          <input
            type="number"
            min="0"
            step="0.1"
            value={vatRate}
            onChange={(e) => setVatRate(e.target.value)}
            className={field}
          />
        </label>
        <label className={label}>
          Expires
          <input name="expiresAt" type="date" className={field} />
        </label>
        <label className={label}>
          Deposit (&pound;)
          <input name="deposit" type="number" min="0" step="0.01" className={field} />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className={label}>
          Payment terms
          <input
            name="paymentTerms"
            defaultValue={defaultPaymentTerms ?? ""}
            className={field}
            placeholder="e.g. 50% deposit, balance on completion"
          />
        </label>
        <label className={label}>
          Exclusions
          <input name="exclusions" className={field} placeholder="What's not included" />
        </label>
        <label className={`${label} sm:col-span-2`}>
          Terms &amp; conditions
          <textarea name="terms" rows={2} defaultValue={defaultQuoteTerms ?? ""} className={field} />
        </label>
      </div>

      <div className="flex flex-col gap-1 border-t border-black/8 pt-2 text-xs text-ink-2 sm:flex-row sm:items-center sm:justify-between">
        <span>
          Cost {formatGBP(Math.round(totals.costSubtotal * 100))} &middot; Sale{" "}
          {formatGBP(Math.round(totals.saleSubtotal * 100))} &middot; VAT {formatGBP(Math.round(totals.vatAmount * 100))}
        </span>
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold text-ink-2">
            Total: <span className="font-mono text-sm text-ink">{formatGBP(Math.round(totals.total * 100))}</span>
          </span>
          <button
            type="submit"
            className="btn-primary rounded-lg bg-brand px-3 py-2.5 text-sm font-bold text-white hover:bg-brand-strong sm:py-1.5"
          >
            Save quote
          </button>
        </div>
      </div>
    </form>
  );
}

function QuoteRow({ quote, tenantId, converted }: { quote: Quote; tenantId: string; converted: boolean }) {
  const [status, setStatus] = useState(quote.status);
  const [isPending, startTransition] = useTransition();
  const expired = quote.expires_at ? isPastUK(quote.expires_at) : false;

  return (
    <div className="row-hover border-b border-black/8 pb-3 last:border-none last:pb-0">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink">{quote.client_name}</p>
          <p className="text-xs text-muted">
            {quote.quote_number ?? "no number"} &middot; {quote.line_items.length} line item
            {quote.line_items.length === 1 ? "" : "s"}
            {quote.expires_at && (
              <>
                {" "}
                &middot; {expired ? "expired" : "expires"}{" "}
                {new Date(quote.expires_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
              </>
            )}
          </p>
        </div>
        <span className="whitespace-nowrap font-mono text-sm font-semibold text-ink">
          {formatGBP(quote.total_pence)}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={status}
          disabled={isPending}
          onChange={(e) => {
            const next = e.target.value;
            setStatus(next);
            startTransition(() => {
              updateQuoteStatus(quote.id, next);
            });
          }}
          className={`min-h-[32px] rounded-lg border-0 px-2.5 py-1.5 text-xs font-bold ${
            STATUS_CLASS[status] ?? "bg-surface-2 text-ink-2"
          } ${isPending ? "opacity-60" : ""}`}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {status === "draft" && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => startTransition(() => sendQuote(quote.id, tenantId))}
            className={`min-h-[32px] whitespace-nowrap rounded-lg border border-black/8 bg-surface-2 px-2.5 py-1.5 text-xs font-semibold text-ink-2 hover:bg-surface ${
              isPending ? "opacity-60" : ""
            }`}
          >
            Send to customer
          </button>
        )}

        <a
          href={`/api/quotes/${quote.id}/pdf?token=${quote.accept_token}`}
          target="_blank"
          rel="noreferrer"
          className="min-h-[32px] rounded-lg border border-black/8 px-2.5 py-1.5 text-xs font-semibold text-ink-2 hover:bg-surface flex items-center"
        >
          PDF
        </a>

        {(status === "sent" || status === "accepted" || status === "declined") && (
          <a
            href={`/quote/${quote.id}/${quote.accept_token}`}
            target="_blank"
            rel="noreferrer"
            className="min-h-[32px] rounded-lg border border-black/8 px-2.5 py-1.5 text-xs font-semibold text-ink-2 hover:bg-surface flex items-center"
          >
            Customer link
          </a>
        )}

        {status === "accepted" && !converted && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => startTransition(() => convertQuoteToProject(quote.id, tenantId))}
            className={`min-h-[32px] whitespace-nowrap rounded-lg border border-brand/30 bg-brand-tint px-2.5 py-1.5 text-xs font-semibold text-brand-strong hover:bg-brand-tint/80 ${
              isPending ? "opacity-60" : ""
            }`}
          >
            Convert to project
          </button>
        )}
        <DeleteButton
          action={deleteQuote}
          id={quote.id}
          confirmText={`Delete the quote for ${quote.client_name}? This can't be undone.`}
          className="min-h-[32px] rounded-lg border border-[rgba(208,59,59,0.3)] bg-[rgba(208,59,59,0.08)] px-2.5 py-1.5 text-xs font-semibold text-critical hover:bg-[rgba(208,59,59,0.15)]"
        />
      </div>
    </div>
  );
}

export function QuotesPanel({
  tenantId,
  quotes,
  convertedQuoteIds,
  defaultVatRate,
  defaultQuoteTerms,
  defaultPaymentTerms,
}: {
  tenantId: string;
  quotes: Quote[];
  convertedQuoteIds: string[];
  defaultVatRate: number;
  defaultQuoteTerms: string | null;
  defaultPaymentTerms: string | null;
}) {
  const converted = new Set(convertedQuoteIds);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return quotes;
    return quotes.filter((quote) =>
      [quote.client_name, quote.quote_number, quote.reference, quote.customer_email].some((f) => f?.toLowerCase().includes(q))
    );
  }, [quotes, query]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page_ = Math.min(page, totalPages);
  const pageItems = filtered.slice((page_ - 1) * PAGE_SIZE, page_ * PAGE_SIZE);

  return (
    <div className="rounded-2xl border border-black/8 bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
          <IconDocument className="h-4 w-4 text-brand" />
          Quotes
        </h2>
        {quotes.length > 0 && (
          <PanelSearchInput
            value={query}
            onChange={(v) => {
              setQuery(v);
              setPage(1);
            }}
            placeholder="Search quotes…"
          />
        )}
      </div>
      <NewQuoteForm
        tenantId={tenantId}
        defaultVatRate={defaultVatRate}
        defaultQuoteTerms={defaultQuoteTerms}
        defaultPaymentTerms={defaultPaymentTerms}
      />
      <div className="mt-4 flex flex-col gap-3">
        {quotes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-black/15 py-8 text-center">
            <p className="text-sm font-semibold text-ink">No quotes yet</p>
            <p className="mt-1 px-2 text-sm text-muted">Build one above to send to a lead or customer.</p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No quotes match &ldquo;{query}&rdquo;.</p>
        ) : (
          pageItems.map((q) => <QuoteRow key={q.id} quote={q} tenantId={tenantId} converted={converted.has(q.id)} />)
        )}
      </div>
      <PanelPagination page={page_} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}
