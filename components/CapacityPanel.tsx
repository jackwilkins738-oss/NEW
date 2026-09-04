"use client";

import { useState, type FormEvent } from "react";
import { setTradeCapacity, deleteTradeCapacity } from "@/app/dashboard/actions";
import { DeleteButton } from "@/components/DeleteButton";

type Trade = { id: string; trade_name: string; percent_booked: number };

const field =
  "mt-1 w-full rounded-md border border-black/15 bg-surface px-2.5 py-2 text-base text-ink outline-none focus:border-brand sm:text-sm";
const label = "text-xs font-semibold text-ink-2";

function meterColor(percent: number) {
  if (percent >= 100) return "var(--status-warning)"; // fully booked - worth noticing, not necessarily bad
  return "var(--brand)";
}

function TradeRow({ trade }: { trade: Trade }) {
  return (
    <div className="border-t border-black/10 py-2.5 first:border-none first:pt-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-ink">{trade.trade_name}</span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-semibold text-ink-2">{trade.percent_booked}%</span>
          <DeleteButton
            action={deleteTradeCapacity}
            id={trade.id}
            confirmText={`Remove ${trade.trade_name} from capacity tracking?`}
            label="Remove"
            className="text-[11px] font-semibold text-muted hover:text-critical"
          />
        </div>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-brand-tint">
        <div
          className="h-full rounded-full transition-[width]"
          style={{ width: `${Math.min(100, trade.percent_booked)}%`, background: meterColor(trade.percent_booked) }}
        />
      </div>
    </div>
  );
}

function AddTradeForm({ tenantId }: { tenantId: string }) {
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const formData = new FormData(e.currentTarget);
    await setTradeCapacity(formData);
    setPending(false);
    e.currentTarget.reset();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-black/10 bg-surface-2 p-3 sm:grid-cols-4 sm:items-end">
      <input type="hidden" name="tenantId" value={tenantId} />
      <label className={`${label} col-span-2 sm:col-span-2`}>
        Trade
        <input name="tradeName" required className={field} placeholder="e.g. Roofers" />
      </label>
      <label className={label}>
        % booked
        <input name="percentBooked" type="number" min="0" max="100" required className={field} placeholder="80" />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand px-3 py-2.5 text-sm font-bold text-white hover:bg-brand-strong disabled:opacity-60 sm:py-1.5"
      >
        {pending ? "Saving…" : "Set"}
      </button>
    </form>
  );
}

export function CapacityPanel({ tenantId, trades }: { tenantId: string; trades: Trade[] }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-surface p-5 shadow-sm">
      <h2 className="text-sm font-bold text-ink">Trade capacity this week</h2>
      <p className="text-xs text-muted">Kept up to date by you - add a trade already listed to update its percentage</p>

      <AddTradeForm tenantId={tenantId} />

      <div className="mt-1">
        {trades.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-black/15 py-6 text-center">
            <p className="text-sm text-muted">No trades tracked yet - add one above.</p>
          </div>
        ) : (
          trades.map((t) => <TradeRow key={t.id} trade={t} />)
        )}
      </div>
    </div>
  );
}
