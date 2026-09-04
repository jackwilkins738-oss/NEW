import { addInvoice, markInvoicePaid } from "@/app/dashboard/actions";
import { formatGBP } from "@/lib/format";

type Invoice = {
  id: string;
  client_name: string;
  reference: string | null;
  amount_pence: number;
  due_date: string;
  status: string;
};

function invoiceState(inv: Invoice): "paid" | "overdue" | "due_soon" | "upcoming" {
  if (inv.status === "paid") return "paid";
  const due = new Date(inv.due_date + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (due < today) return "overdue";
  const daysUntil = (due.getTime() - today.getTime()) / 86_400_000;
  return daysUntil <= 7 ? "due_soon" : "upcoming";
}

const STATE_LABEL: Record<string, string> = {
  paid: "Paid",
  overdue: "Overdue",
  due_soon: "Due soon",
  upcoming: "Upcoming",
};

const STATE_CLASS: Record<string, string> = {
  paid: "bg-[rgba(12,163,12,0.15)] text-good",
  overdue: "bg-[rgba(208,59,59,0.15)] text-critical",
  due_soon: "bg-[rgba(250,178,25,0.25)] text-[#8a5a00]",
  upcoming: "bg-surface-2 text-ink-2",
};

const SORT_RANK: Record<string, number> = { overdue: 0, due_soon: 1, upcoming: 2, paid: 3 };

export function InvoicesPanel({ tenantId, invoices }: { tenantId: string; invoices: Invoice[] }) {
  const sorted = [...invoices].sort((a, b) => {
    const rankDiff = SORT_RANK[invoiceState(a)] - SORT_RANK[invoiceState(b)];
    if (rankDiff !== 0) return rankDiff;
    return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
  });

  return (
    <div className="rounded-2xl border border-black/10 bg-surface p-5 shadow-sm">
      <h2 className="text-sm font-bold text-ink">Invoices</h2>

      <form
        action={addInvoice}
        className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-black/10 bg-surface-2 p-3 sm:grid-cols-5 sm:items-end"
      >
        <input type="hidden" name="tenantId" value={tenantId} />
        <label className="col-span-2 text-xs font-semibold text-ink-2 sm:col-span-1">
          Client
          <input
            name="clientName"
            required
            className="mt-1 w-full rounded-md border border-black/15 bg-surface px-2 py-1.5 text-sm text-ink outline-none focus:border-brand"
          />
        </label>
        <label className="text-xs font-semibold text-ink-2">
          Reference
          <input
            name="reference"
            className="mt-1 w-full rounded-md border border-black/15 bg-surface px-2 py-1.5 text-sm text-ink outline-none focus:border-brand"
          />
        </label>
        <label className="text-xs font-semibold text-ink-2">
          Amount (&pound;)
          <input
            name="amount"
            type="number"
            min="0"
            step="0.01"
            required
            className="mt-1 w-full rounded-md border border-black/15 bg-surface px-2 py-1.5 text-sm text-ink outline-none focus:border-brand"
          />
        </label>
        <label className="text-xs font-semibold text-ink-2">
          Due date
          <input
            name="dueDate"
            type="date"
            required
            className="mt-1 w-full rounded-md border border-black/15 bg-surface px-2 py-1.5 text-sm text-ink outline-none focus:border-brand"
          />
        </label>
        <button
          type="submit"
          className="col-span-2 rounded-md bg-brand px-3 py-1.5 text-sm font-bold text-white hover:bg-brand-strong sm:col-span-1"
        >
          Add
        </button>
      </form>

      <div className="mt-4 flex flex-col gap-3">
        {sorted.length === 0 && <p className="text-sm text-muted">No invoices yet.</p>}
        {sorted.map((inv) => {
          const state = invoiceState(inv);
          return (
            <div
              key={inv.id}
              className="flex flex-col gap-2 border-b border-black/10 pb-3 last:border-none last:pb-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-semibold text-ink">{inv.client_name}</p>
                <p className="text-xs text-muted">
                  {inv.reference ?? "no reference"} &middot; due{" "}
                  {new Date(inv.due_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold text-ink">{formatGBP(inv.amount_pence)}</span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATE_CLASS[state]}`}>
                  {STATE_LABEL[state]}
                </span>
                {inv.status !== "paid" && (
                  <form action={markInvoicePaid.bind(null, inv.id)}>
                    <button
                      type="submit"
                      className="rounded-md border border-black/10 bg-surface-2 px-2.5 py-1 text-xs font-semibold text-ink-2 hover:bg-[rgba(12,163,12,0.15)] hover:text-good"
                    >
                      Mark paid
                    </button>
                  </form>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
