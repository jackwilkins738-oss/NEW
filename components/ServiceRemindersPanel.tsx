"use client";

import { useState, useTransition } from "react";
import { addServiceReminder, deleteServiceReminder } from "@/app/dashboard/actions";

export type ServiceReminder = { id: string; label: string; due_on: string; repeat_months: number | null; sent_at: string | null };

const field =
  "mt-1 w-full rounded-lg border border-black/15 bg-surface px-2.5 py-2 text-base text-ink outline-none focus:border-brand sm:text-sm";
const label = "text-xs font-semibold text-ink-2";

const EXAMPLES = ["Annual boiler service", "Gas safety certificate", "EICR (electrical safety check)", "Gutter clear", "Chimney sweep", "Roof inspection"];

// Repeat work that books itself: on the due date the customer is emailed to
// book in (lib/serviceReminders.ts), and a repeating one sets up the next.
export function ServiceRemindersPanel({ projectId, tenantId, reminders }: { projectId: string; tenantId: string; reminders: ServiceReminder[] }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const upcoming = reminders.filter((r) => !r.sent_at).sort((a, b) => a.due_on.localeCompare(b.due_on));
  const sent = reminders.filter((r) => r.sent_at);

  return (
    <div className="rounded-2xl border border-black/8 bg-surface p-5 shadow-sm">
      <h2 className="text-sm font-bold text-ink">Service reminders</h2>
      <p className="text-xs text-muted">
        Emails the customer to book in when it&apos;s due - boiler services, safety certificates, gutter clears. Repeating ones book
        the next reminder themselves.
      </p>

      <form
        action={(formData) =>
          startTransition(async () => {
            setError(null);
            const res = await addServiceReminder(projectId, tenantId, formData);
            if (!res.ok) setError(res.error);
          })
        }
        className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px_auto_auto] sm:items-end"
      >
        <label className={label}>
          What for
          <input name="label" required maxLength={120} list="service-examples" placeholder="e.g. Annual boiler service" className={field} />
          <datalist id="service-examples">
            {EXAMPLES.map((e) => (
              <option key={e} value={e} />
            ))}
          </datalist>
        </label>
        <label className={label}>
          Remind them in
          <select name="months" defaultValue="12" className={field}>
            {[3, 6, 12, 24, 36, 60].map((m) => (
              <option key={m} value={m}>
                {m % 12 === 0 ? `${m / 12} year${m === 12 ? "" : "s"}` : `${m} months`}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-xs font-semibold text-ink-2">
          <input type="checkbox" name="repeat" defaultChecked className="h-4 w-4 accent-brand" />
          Repeat
        </label>
        <button
          type="submit"
          disabled={isPending}
          className="btn-primary rounded-lg bg-brand px-3 py-2 text-sm font-bold text-white hover:bg-brand-strong disabled:opacity-60"
        >
          Add
        </button>
      </form>
      {error && <p className="mt-2 text-xs font-semibold text-critical">{error}</p>}

      {upcoming.length > 0 && (
        <ul className="mt-4 flex flex-col">
          {upcoming.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 border-b border-black/8 py-2 last:border-none">
              <span className="text-sm text-ink-2">
                {r.label}
                <span className="ml-2 text-xs text-muted">
                  {new Date(`${r.due_on}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  {r.repeat_months ? ` · every ${r.repeat_months % 12 === 0 ? `${r.repeat_months / 12 === 1 ? "year" : `${r.repeat_months / 12} years`}` : `${r.repeat_months} months`}` : ""}
                </span>
              </span>
              <button
                type="button"
                disabled={isPending}
                onClick={() => startTransition(() => deleteServiceReminder(r.id, projectId))}
                className="text-xs font-semibold text-critical hover:underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {sent.length > 0 && <p className="mt-3 text-xs text-muted">{sent.length} reminder{sent.length === 1 ? "" : "s"} already sent for this job.</p>}
    </div>
  );
}
