"use client";

import { useState, useTransition } from "react";
import { addQuote, updateQuoteStatus, deleteQuote, convertQuoteToProject } from "@/app/dashboard/actions";
import { formatGBP } from "@/lib/format";
import { DeleteButton } from "@/components/DeleteButton";

type LineItem = { description: string; unit_price_pence: number };

type Quote = {
  id: string;
  client_name: string;
  reference: string | null;
  line_items: LineItem[];
  total_pence: number;
  status: string;
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

// text-base (16px), not text-sm: iOS Safari auto-zooms into any input under
// 16px on focus - matches the field size already used in InvoicesPanel.
const field =
  "mt-1 w-full rounded-md border border-black/15 bg-surface px-2.5 py-2 text-base text-ink outline-none focus:border-brand sm:text-sm";

type DraftLine = { description: string; amountPounds: string };

function NewQuoteForm({ tenantId }: { tenantId: string }) {
  const [lines, setLines] = useState<DraftLine[]>([{ description: "", amountPounds: "" }]);
  const total = lines.reduce((sum, l) => sum + (Number(l.amountPounds) || 0), 0);

  const updateLine = (i: number, patch: Partial<DraftLine>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const lineItemsJson = JSON.stringify(
    lines.map((l) => ({
      description: l.description,
      unit_price_pence: Math.round((Number(l.amountPounds) || 0) * 100),
    }))
  );

  return (
    <form
      action={addQuote}
      className="mt-3 flex flex-col gap-3 rounded-xl border border-black/10 bg-surface-2 p-3"
      onSubmit={() => {
        // The hidden field's value is read by the browser before this fires,
        // so clearing state here is safe - it only resets what's shown next.
        setTimeout(() => setLines([{ description: "", amountPounds: "" }]), 0);
      }}
    >
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="lineItems" value={lineItemsJson} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="text-xs font-semibold text-ink-2">
          Client
          <input name="clientName" required className={field} />
        </label>
        <label className="text-xs font-semibold text-ink-2">
          Reference
          <input name="reference" className={field} />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        {lines.map((line, i) => (
          <div key={i} className="grid grid-cols-[1fr_100px_auto] items-end gap-2">
            <label className="text-xs font-semibold text-ink-2">
              {i === 0 ? "Line item" : ""}
              <input
                value={line.description}
                onChange={(e) => updateLine(i, { description: e.target.value })}
                placeholder="e.g. Roof re-felt"
                className={field}
              />
            </label>
            <label className="text-xs font-semibold text-ink-2">
              {i === 0 ? "£" : ""}
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
              className="min-h-[36px] rounded-md border border-black/10 px-2 text-xs font-semibold text-ink-2 hover:bg-surface"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setLines((prev) => [...prev, { description: "", amountPounds: "" }])}
          className="self-start text-xs font-semibold text-brand hover:underline"
        >
          + Add line
        </button>
      </div>

      <div className="flex items-center justify-between border-t border-black/10 pt-2">
        <span className="text-xs font-semibold text-ink-2">
          Total: <span className="font-mono text-sm text-ink">{formatGBP(Math.round(total * 100))}</span>
        </span>
        <button
          type="submit"
          className="rounded-md bg-brand px-3 py-2.5 text-sm font-bold text-white hover:bg-brand-strong sm:py-1.5"
        >
          Save quote
        </button>
      </div>
    </form>
  );
}

function QuoteRow({ quote, tenantId, converted }: { quote: Quote; tenantId: string; converted: boolean }) {
  const [status, setStatus] = useState(quote.status);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="border-b border-black/10 pb-3 last:border-none last:pb-0">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink">{quote.client_name}</p>
          <p className="text-xs text-muted">
            {quote.reference ?? "no reference"} &middot; {quote.line_items.length} line item
            {quote.line_items.length === 1 ? "" : "s"}
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
          className={`min-h-[32px] rounded-md border-0 px-2.5 py-1.5 text-xs font-bold ${
            STATUS_CLASS[status] ?? "bg-surface-2 text-ink-2"
          } ${isPending ? "opacity-60" : ""}`}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {status === "accepted" && !converted && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => startTransition(() => convertQuoteToProject(quote.id, tenantId))}
            className={`min-h-[32px] whitespace-nowrap rounded-md border border-brand/30 bg-brand-tint px-2.5 py-1.5 text-xs font-semibold text-brand-strong hover:bg-brand-tint/80 ${
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
          className="min-h-[32px] rounded-md border border-[rgba(208,59,59,0.3)] bg-[rgba(208,59,59,0.08)] px-2.5 py-1.5 text-xs font-semibold text-critical hover:bg-[rgba(208,59,59,0.15)]"
        />
      </div>
    </div>
  );
}

export function QuotesPanel({
  tenantId,
  quotes,
  convertedQuoteIds,
}: {
  tenantId: string;
  quotes: Quote[];
  convertedQuoteIds: string[];
}) {
  const converted = new Set(convertedQuoteIds);

  return (
    <div className="rounded-2xl border border-black/10 bg-surface p-5 shadow-sm">
      <h2 className="text-sm font-bold text-ink">Quotes</h2>
      <NewQuoteForm tenantId={tenantId} />
      <div className="mt-4 flex flex-col gap-3">
        {quotes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-black/15 py-8 text-center">
            <p className="text-sm font-semibold text-ink">No quotes yet</p>
            <p className="mt-1 px-2 text-sm text-muted">Build one above to send to a lead or customer.</p>
          </div>
        ) : (
          quotes.map((q) => (
            <QuoteRow key={q.id} quote={q} tenantId={tenantId} converted={converted.has(q.id)} />
          ))
        )}
      </div>
    </div>
  );
}
