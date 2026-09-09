"use client";

import { useState, useTransition } from "react";
import { addSnag, updateSnagStatus, deleteSnag } from "@/app/dashboard/actions";
import { DeleteButton } from "@/components/DeleteButton";

type Snag = {
  id: string;
  description: string;
  location: string | null;
  assigned_to: string | null;
  due_date: string | null;
  status: string;
};

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "assigned", label: "Assigned" },
  { value: "complete", label: "Complete" },
];

const STATUS_CLASS: Record<string, string> = {
  open: "bg-[rgba(208,59,59,0.15)] text-critical",
  assigned: "bg-[rgba(250,178,25,0.25)] text-[#8a5a00]",
  complete: "bg-[rgba(12,163,12,0.15)] text-good",
};

const field =
  "mt-1 w-full rounded-md border border-black/15 bg-surface px-2.5 py-2 text-base text-ink outline-none focus:border-brand sm:text-sm";
const label = "text-xs font-semibold text-ink-2";

function SnagRow({ snag, projectId }: { snag: Snag; projectId: string }) {
  const [status, setStatus] = useState(snag.status);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="row-hover flex flex-col gap-2 border-b border-black/8 py-3 last:border-none sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-semibold text-ink">{snag.description}</p>
        <p className="text-xs text-muted">
          {snag.location ?? "no location"}
          {snag.assigned_to ? ` · ${snag.assigned_to}` : ""}
          {snag.due_date ? ` · due ${new Date(snag.due_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <select
          value={status}
          disabled={isPending}
          onChange={(e) => {
            const next = e.target.value;
            setStatus(next);
            startTransition(() => updateSnagStatus(projectId, snag.id, next));
          }}
          className={`min-h-[32px] rounded-md border-0 px-2.5 py-1.5 text-xs font-bold ${STATUS_CLASS[status]} ${
            isPending ? "opacity-60" : ""
          }`}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <DeleteButton
          action={deleteSnag.bind(null, projectId)}
          id={snag.id}
          confirmText="Delete this snag? This can't be undone."
          className="min-h-[32px] rounded-md border border-[rgba(208,59,59,0.3)] bg-[rgba(208,59,59,0.08)] px-2.5 py-1.5 text-xs font-semibold text-critical hover:bg-[rgba(208,59,59,0.15)]"
        />
      </div>
    </div>
  );
}

export function SnagsPanel({ tenantId, projectId, snags }: { tenantId: string; projectId: string; snags: Snag[] }) {
  const remaining = snags.filter((s) => s.status !== "complete").length;

  return (
    <div className="rounded-2xl border border-black/8 bg-surface p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-ink">Snagging</h2>
        {remaining > 0 && (
          <span className="rounded-full bg-[rgba(208,59,59,0.15)] px-2 py-0.5 text-xs font-bold text-critical">
            {remaining} remaining
          </span>
        )}
      </div>

      <form action={addSnag} className="mt-3 grid grid-cols-1 gap-2 rounded-xl border border-black/8 bg-surface-2 p-3 sm:grid-cols-4 sm:items-end">
        <input type="hidden" name="tenantId" value={tenantId} />
        <input type="hidden" name="projectId" value={projectId} />
        <label className={`${label} sm:col-span-2`}>
          Description
          <input name="description" required className={field} placeholder="e.g. Touch up paint by front window" />
        </label>
        <label className={label}>
          Location
          <input name="location" className={field} />
        </label>
        <label className={label}>
          Assigned to
          <input name="assignedTo" className={field} />
        </label>
        <label className={label}>
          Due date
          <input name="dueDate" type="date" className={field} />
        </label>
        <button
          type="submit"
          className="btn-primary rounded-md bg-brand px-3 py-2.5 text-sm font-bold text-white hover:bg-brand-strong sm:col-span-4 sm:w-auto sm:justify-self-start sm:py-1.5"
        >
          Add snag
        </button>
      </form>

      <div className="mt-4 flex flex-col">
        {snags.length === 0 ? (
          <div className="rounded-xl border border-dashed border-black/15 py-8 text-center">
            <p className="text-sm font-semibold text-ink">No snags logged</p>
            <p className="mt-1 px-2 text-sm text-muted">Log one above as they're spotted.</p>
          </div>
        ) : (
          snags.map((s) => <SnagRow key={s.id} snag={s} projectId={projectId} />)
        )}
      </div>
    </div>
  );
}
