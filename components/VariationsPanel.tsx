"use client";

import { useTransition } from "react";
import {
  addVariation,
  approveVariation,
  declineVariation,
  deleteVariation,
  createInvoiceFromVariation,
} from "@/app/dashboard/actions";
import { formatGBP } from "@/lib/format";
import { DeleteButton } from "@/components/DeleteButton";

type Variation = {
  id: string;
  number: string | null;
  description: string;
  materials_cost_pence: number;
  labour_cost_pence: number;
  other_cost_pence: number;
  customer_price_pence: number;
  additional_days: number | null;
  status: string;
  invoice_id: string | null;
};

const STATUS_CLASS: Record<string, string> = {
  pending: "bg-[rgba(250,178,25,0.25)] text-[#8a5a00]",
  approved: "bg-[rgba(12,163,12,0.15)] text-good",
  declined: "bg-[rgba(208,59,59,0.15)] text-critical",
};

const field =
  "mt-1 w-full rounded-md border border-black/15 bg-surface px-2.5 py-2 text-base text-ink outline-none focus:border-brand sm:text-sm";
const label = "text-xs font-semibold text-ink-2";

function VariationRow({ variation, projectId }: { variation: Variation; projectId: string }) {
  const [isPending, startTransition] = useTransition();
  const totalCost = variation.materials_cost_pence + variation.labour_cost_pence + variation.other_cost_pence;

  return (
    <div className="row-hover border-b border-black/8 py-3 last:border-none">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink">
            {variation.number ?? "Variation"} &middot; {variation.description}
          </p>
          <p className="text-xs text-muted">
            Cost {formatGBP(totalCost)}
            {variation.additional_days ? ` · +${variation.additional_days} day${variation.additional_days === 1 ? "" : "s"}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-sm font-semibold text-ink">{formatGBP(variation.customer_price_pence)}</p>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_CLASS[variation.status]}`}>
            {variation.status}
          </span>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {variation.status === "pending" && (
          <>
            <button
              type="button"
              disabled={isPending}
              onClick={() => startTransition(() => approveVariation(projectId, variation.id))}
              className="min-h-[32px] rounded-md border border-brand/30 bg-brand-tint px-2.5 py-1.5 text-xs font-semibold text-brand-strong hover:bg-brand-tint/80"
            >
              Approve
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => startTransition(() => declineVariation(projectId, variation.id))}
              className="min-h-[32px] rounded-md border border-black/8 bg-surface-2 px-2.5 py-1.5 text-xs font-semibold text-ink-2 hover:bg-surface"
            >
              Decline
            </button>
          </>
        )}
        {variation.status === "approved" && !variation.invoice_id && variation.customer_price_pence > 0 && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => startTransition(() => createInvoiceFromVariation(projectId, variation.id))}
            className="min-h-[32px] rounded-md border border-black/8 bg-surface-2 px-2.5 py-1.5 text-xs font-semibold text-ink-2 hover:bg-surface"
          >
            Create invoice
          </button>
        )}
        {variation.invoice_id && (
          <span className="text-xs font-semibold text-muted">Invoiced</span>
        )}
        <DeleteButton
          action={deleteVariation.bind(null, projectId)}
          id={variation.id}
          confirmText={`Delete ${variation.number ?? "this variation"}? This can't be undone.`}
          className="min-h-[32px] rounded-md border border-[rgba(208,59,59,0.3)] bg-[rgba(208,59,59,0.08)] px-2.5 py-1.5 text-xs font-semibold text-critical hover:bg-[rgba(208,59,59,0.15)]"
        />
      </div>
    </div>
  );
}

export function VariationsPanel({
  tenantId,
  projectId,
  variations,
}: {
  tenantId: string;
  projectId: string;
  variations: Variation[];
}) {
  return (
    <div className="rounded-2xl border border-black/8 bg-surface p-5 shadow-sm">
      <h2 className="text-sm font-bold text-ink">Variations</h2>
      <p className="text-xs text-muted">Extra work the customer's asked for - approving adds it to the project value.</p>

      <form
        action={addVariation}
        className="mt-3 grid grid-cols-1 gap-2 rounded-xl border border-black/8 bg-surface-2 p-3 sm:grid-cols-3"
      >
        <input type="hidden" name="tenantId" value={tenantId} />
        <input type="hidden" name="projectId" value={projectId} />
        <label className={`${label} sm:col-span-3`}>
          Description
          <input name="description" required className={field} placeholder="e.g. Add a rooflight to the rear slope" />
        </label>
        <label className={label}>
          Materials (&pound;)
          <input name="materialsCost" type="number" min="0" step="0.01" className={field} />
        </label>
        <label className={label}>
          Labour (&pound;)
          <input name="labourCost" type="number" min="0" step="0.01" className={field} />
        </label>
        <label className={label}>
          Other cost (&pound;)
          <input name="otherCost" type="number" min="0" step="0.01" className={field} />
        </label>
        <label className={label}>
          Customer price (&pound;)
          <input name="customerPrice" type="number" min="0" step="0.01" className={field} />
        </label>
        <label className={label}>
          Additional days
          <input name="additionalDays" type="number" min="0" step="1" className={field} />
        </label>
        <button
          type="submit"
          className="btn-primary self-end rounded-md bg-brand px-3 py-2.5 text-sm font-bold text-white hover:bg-brand-strong sm:py-1.5"
        >
          Log variation
        </button>
      </form>

      <div className="mt-4 flex flex-col">
        {variations.length === 0 ? (
          <div className="rounded-xl border border-dashed border-black/15 py-8 text-center">
            <p className="text-sm font-semibold text-ink">No variations yet</p>
            <p className="mt-1 px-2 text-sm text-muted">Log one above when the customer asks for extra work.</p>
          </div>
        ) : (
          variations.map((v) => <VariationRow key={v.id} variation={v} projectId={projectId} />)
        )}
      </div>
    </div>
  );
}
