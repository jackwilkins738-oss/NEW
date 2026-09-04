"use client";

import { useState } from "react";
import { formatGBP } from "@/lib/format";

type Project = {
  id: string;
  ref: string | null;
  client_name: string;
  project_type: string | null;
  value_pence: number | null;
  status: string | null;
  created_at: string;
};

const MONTH_LABEL = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const STATUS_LABEL: Record<string, string> = {
  on_track: "On track",
  at_risk: "At risk",
  delayed: "Delayed",
  awaiting_decision: "Awaiting decision",
};

const STATUS_CLASS: Record<string, string> = {
  on_track: "bg-[rgba(12,163,12,0.15)] text-good",
  at_risk: "bg-[rgba(250,178,25,0.25)] text-[#8a5a00]",
  delayed: "bg-[rgba(208,59,59,0.15)] text-critical",
  awaiting_decision: "bg-surface-2 text-ink-2",
};

function groupByMonth(projects: Project[]) {
  const map = new Map<number, { label: string; projects: Project[]; total: number }>();
  for (const p of projects) {
    const d = new Date(p.created_at);
    const key = d.getFullYear() * 12 + d.getMonth();
    if (!map.has(key)) {
      map.set(key, { label: `${MONTH_LABEL[d.getMonth()]} ${d.getFullYear()}`, projects: [], total: 0 });
    }
    const bucket = map.get(key)!;
    bucket.projects.push(p);
    bucket.total += p.value_pence ?? 0;
  }
  return [...map.entries()].sort((a, b) => b[0] - a[0]).map(([, v]) => v);
}

function MonthGroup({ label, projects, total }: { label: string; projects: Project[]; total: number }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-black/10 first:border-none">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-md px-1 py-3 text-left hover:bg-surface-2"
      >
        <div>
          <p className="text-sm font-semibold text-ink">{label}</p>
          <p className="text-xs text-muted">
            {projects.length} project{projects.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-semibold text-ink">{formatGBP(total)}</span>
          <span className="text-xs text-muted">{open ? "▾" : "▸"}</span>
        </div>
      </button>

      {open && (
        <div className="flex flex-col gap-2 pb-3 pl-1">
          {projects.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-2/60 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{p.client_name}</p>
                <p className="text-xs text-muted">
                  {p.ref}
                  {p.project_type ? ` · ${p.project_type}` : ""}
                </p>
              </div>
              <div className="flex flex-none items-center gap-2">
                <span className="font-mono text-xs font-semibold text-ink">
                  {p.value_pence != null ? formatGBP(p.value_pence) : "—"}
                </span>
                <span
                  className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    STATUS_CLASS[p.status ?? ""] ?? "bg-surface-2 text-ink-2"
                  }`}
                >
                  {STATUS_LABEL[p.status ?? ""] ?? p.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function MonthlyHistory({ projects }: { projects: Project[] }) {
  const groups = groupByMonth(projects);

  return (
    <div className="rounded-2xl border border-black/10 bg-surface p-5 shadow-sm">
      <h2 className="text-sm font-bold text-ink">Progress by month</h2>
      <p className="text-xs text-muted">Every project, grouped by the month it was added</p>
      <div className="mt-2">
        {groups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-black/15 py-8 text-center">
            <p className="text-sm text-muted">Nothing to show yet - add a project to start building this up.</p>
          </div>
        ) : (
          groups.map((g) => <MonthGroup key={g.label} {...g} />)
        )}
      </div>
    </div>
  );
}
