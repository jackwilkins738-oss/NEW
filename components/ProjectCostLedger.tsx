"use client";

import { useState, useTransition } from "react";
import { addProjectCostItem, markCostItemPaid, deleteProjectCostItem } from "@/app/dashboard/actions";
import { formatGBP } from "@/lib/format";
import { DeleteButton } from "@/components/DeleteButton";

type CostItem = {
  id: string;
  category: string;
  description: string | null;
  supplier: string | null;
  amount_pence: number;
  status: string;
  cost_date: string;
  notes: string | null;
};

const CATEGORY_OPTIONS = [
  { value: "materials", label: "Materials" },
  { value: "labour", label: "Labour" },
  { value: "subcontractors", label: "Subcontractors" },
  { value: "plant", label: "Plant" },
  { value: "other", label: "Other" },
];

const CATEGORY_LABEL = Object.fromEntries(CATEGORY_OPTIONS.map((c) => [c.value, c.label]));

const field =
  "mt-1 w-full rounded-md border border-black/15 bg-surface px-2.5 py-2 text-base text-ink outline-none focus:border-brand sm:text-sm";
const label = "text-xs font-semibold text-ink-2";

function CostItemRow({ item, projectId }: { item: CostItem; projectId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="row-hover flex flex-col gap-2 border-b border-black/10 py-3 last:border-none sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-semibold text-ink">
          {item.description || CATEGORY_LABEL[item.category] || "Cost"}
          {item.supplier && <span className="font-normal text-muted"> &middot; {item.supplier}</span>}
        </p>
        <p className="text-xs text-muted">
          {CATEGORY_LABEL[item.category] ?? "Other"} &middot;{" "}
          {new Date(item.cost_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm font-semibold text-ink">{formatGBP(item.amount_pence)}</span>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-bold ${
            item.status === "paid" ? "bg-[rgba(12,163,12,0.15)] text-good" : "bg-surface-2 text-ink-2"
          }`}
        >
          {item.status === "paid" ? "Paid" : "Committed"}
        </span>
        {item.status !== "paid" && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => startTransition(() => markCostItemPaid(projectId, item.id))}
            className="min-h-[32px] rounded-md border border-black/10 bg-surface-2 px-2.5 py-1.5 text-xs font-semibold text-ink-2 hover:bg-[rgba(12,163,12,0.15)] hover:text-good"
          >
            Mark paid
          </button>
        )}
        <DeleteButton
          action={deleteProjectCostItem.bind(null, projectId)}
          id={item.id}
          confirmText="Delete this cost item? This can't be undone."
          className="min-h-[32px] rounded-md border border-[rgba(208,59,59,0.3)] bg-[rgba(208,59,59,0.08)] px-2.5 py-1.5 text-xs font-semibold text-critical hover:bg-[rgba(208,59,59,0.15)]"
        />
      </div>
    </div>
  );
}

export function ProjectCostLedger({
  tenantId,
  projectId,
  items,
}: {
  tenantId: string;
  projectId: string;
  items: CostItem[];
}) {
  const [category, setCategory] = useState("materials");
  const sorted = [...items].sort((a, b) => new Date(b.cost_date).getTime() - new Date(a.cost_date).getTime());

  return (
    <div className="rounded-2xl border border-black/10 bg-surface p-5 shadow-sm">
      <h2 className="text-sm font-bold text-ink">Cost ledger</h2>
      <p className="text-xs text-muted">Log a cost the moment it's committed, mark it paid once it's actually settled.</p>

      <form
        action={addProjectCostItem}
        className="mt-3 grid grid-cols-1 gap-2 rounded-xl border border-black/10 bg-surface-2 p-3 sm:grid-cols-6 sm:items-end"
      >
        <input type="hidden" name="tenantId" value={tenantId} />
        <input type="hidden" name="projectId" value={projectId} />
        <label className={label}>
          Category
          <select name="category" value={category} onChange={(e) => setCategory(e.target.value)} className={field}>
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className={`${label} sm:col-span-2`}>
          Description
          <input name="description" className={field} placeholder="e.g. Timber order" />
        </label>
        <label className={label}>
          Supplier
          <input name="supplier" className={field} />
        </label>
        <label className={label}>
          Amount (&pound;)
          <input name="amount" type="number" min="0" step="0.01" required className={field} />
        </label>
        <label className={label}>
          Date
          <input name="costDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className={field} />
        </label>
        <button
          type="submit"
          className="btn-primary rounded-md bg-brand px-3 py-2.5 text-sm font-bold text-white hover:bg-brand-strong sm:col-span-6 sm:w-auto sm:justify-self-start sm:py-1.5"
        >
          Log cost
        </button>
      </form>

      <div className="mt-4 flex flex-col">
        {sorted.length === 0 ? (
          <div className="rounded-xl border border-dashed border-black/15 py-8 text-center">
            <p className="text-sm font-semibold text-ink">No costs logged yet</p>
            <p className="mt-1 px-2 text-sm text-muted">Log materials, labour, subcontractors or plant above as they come in.</p>
          </div>
        ) : (
          sorted.map((item) => <CostItemRow key={item.id} item={item} projectId={projectId} />)
        )}
      </div>
    </div>
  );
}
