"use client";

import { addCommunication, deleteCommunication } from "@/app/dashboard/actions";
import { DeleteButton } from "@/components/DeleteButton";

type Communication = { id: string; type: string; summary: string; created_at: string };

const TYPE_OPTIONS = [
  { value: "note", label: "Internal note" },
  { value: "call", label: "Phone call" },
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
];

const TYPE_LABEL = Object.fromEntries(TYPE_OPTIONS.map((t) => [t.value, t.label]));

const field =
  "mt-1 w-full rounded-md border border-black/15 bg-surface px-2.5 py-2 text-base text-ink outline-none focus:border-brand sm:text-sm";
const label = "text-xs font-semibold text-ink-2";

export function CommunicationsPanel({
  tenantId,
  projectId,
  communications,
}: {
  tenantId: string;
  projectId: string;
  communications: Communication[];
}) {
  return (
    <div className="rounded-2xl border border-black/10 bg-surface p-5 shadow-sm">
      <h2 className="text-sm font-bold text-ink">Communication</h2>
      <p className="text-xs text-muted">A record, not automated follow-up yet.</p>

      <form action={addCommunication} className="mt-3 grid grid-cols-1 gap-2 rounded-xl border border-black/10 bg-surface-2 p-3 sm:grid-cols-4 sm:items-end">
        <input type="hidden" name="tenantId" value={tenantId} />
        <input type="hidden" name="projectId" value={projectId} />
        <label className={label}>
          Type
          <select name="type" defaultValue="note" className={field}>
            {TYPE_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className={`${label} sm:col-span-3`}>
          Summary
          <input name="summary" required className={field} placeholder="e.g. Customer called regarding start date" />
        </label>
        <button
          type="submit"
          className="rounded-md bg-brand px-3 py-2.5 text-sm font-bold text-white hover:bg-brand-strong sm:col-span-4 sm:w-auto sm:justify-self-start sm:py-1.5"
        >
          Log
        </button>
      </form>

      <div className="mt-4 flex flex-col">
        {communications.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">No communication logged yet.</p>
        ) : (
          communications.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 border-b border-black/10 py-2.5 last:border-none">
              <p className="text-sm text-ink-2">
                <span className="font-mono text-xs text-muted">
                  {new Date(c.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                </span>{" "}
                &mdash; {TYPE_LABEL[c.type] ?? c.type}: {c.summary}
              </p>
              <DeleteButton
                action={deleteCommunication.bind(null, projectId)}
                id={c.id}
                confirmText="Delete this entry?"
                className="min-h-[28px] flex-none rounded-md border border-[rgba(208,59,59,0.3)] bg-[rgba(208,59,59,0.08)] px-2 py-1 text-xs font-semibold text-critical hover:bg-[rgba(208,59,59,0.15)]"
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
