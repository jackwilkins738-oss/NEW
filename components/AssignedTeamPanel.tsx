"use client";

import { useState, useTransition } from "react";
import { assignTeamMemberToProject, unassignTeamMemberFromProject } from "@/app/dashboard/actions";

type TeamOption = { id: string; name: string; role: string | null };

export function AssignedTeamPanel({
  projectId,
  assigned,
  available,
}: {
  projectId: string;
  assigned: TeamOption[];
  available: TeamOption[];
}) {
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState("");
  const unassignedOptions = available.filter((t) => !assigned.some((a) => a.id === t.id));

  return (
    <div className="rounded-2xl border border-black/10 bg-surface p-5 shadow-sm">
      <h2 className="text-sm font-bold text-ink">Assigned team</h2>

      <div className="mt-3 flex flex-wrap gap-2">
        {assigned.length === 0 && <p className="text-sm text-muted">No one assigned yet.</p>}
        {assigned.map((t) => (
          <span
            key={t.id}
            className="flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-ink-2"
          >
            {t.name}
            {t.role ? ` · ${t.role}` : ""}
            <button
              type="button"
              disabled={isPending}
              onClick={() => startTransition(() => unassignTeamMemberFromProject(projectId, t.id))}
              className="text-muted hover:text-critical"
              aria-label={`Remove ${t.name}`}
            >
              &times;
            </button>
          </span>
        ))}
      </div>

      {unassignedOptions.length > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="min-h-[36px] rounded-md border border-black/15 bg-surface px-2.5 py-1.5 text-sm text-ink"
          >
            <option value="">Add team member...</option>
            {unassignedOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!selected || isPending}
            onClick={() => {
              startTransition(() => assignTeamMemberToProject(projectId, selected));
              setSelected("");
            }}
            className="min-h-[36px] rounded-md bg-brand px-3 py-1.5 text-sm font-bold text-white hover:bg-brand-strong disabled:opacity-50"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}
