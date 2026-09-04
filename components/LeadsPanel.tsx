"use client";

import { useState, useTransition } from "react";
import { updateLeadStatus, deleteLead } from "@/app/dashboard/actions";
import { DeleteButton } from "@/components/DeleteButton";

type Lead = {
  id: string;
  name: string | null;
  email: string | null;
  source: string | null;
  status: string;
  created_at: string;
};

const STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "quoted", label: "Quoted" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

const STATUS_CLASS: Record<string, string> = {
  new: "bg-[rgba(250,178,25,0.25)] text-[#8a5a00]",
  contacted: "bg-surface-2 text-ink-2",
  quoted: "bg-surface-2 text-ink-2",
  won: "bg-[rgba(12,163,12,0.15)] text-good",
  lost: "bg-[rgba(208,59,59,0.15)] text-critical",
};

function needsFollowUp(lead: Lead) {
  if (lead.status !== "new") return false;
  const ageHours = (Date.now() - new Date(lead.created_at).getTime()) / 3_600_000;
  return ageHours >= 24;
}

function LeadRow({ lead }: { lead: Lead }) {
  const [status, setStatus] = useState(lead.status);
  const [isPending, startTransition] = useTransition();
  const flagged = needsFollowUp({ ...lead, status });

  return (
    <div className="border-b border-black/10 pb-3 last:border-none last:pb-0">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink">{lead.name ?? lead.email ?? "Unnamed lead"}</p>
          <p className="text-xs text-muted">
            {lead.source ?? "unknown source"} &middot;{" "}
            {new Date(lead.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
          </p>
        </div>
        {flagged && (
          <span className="whitespace-nowrap rounded-full bg-[rgba(208,59,59,0.15)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-critical">
            Needs follow-up
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <select
          value={status}
          disabled={isPending}
          onChange={(e) => {
            const next = e.target.value;
            setStatus(next);
            startTransition(() => {
              updateLeadStatus(lead.id, next);
            });
          }}
          className={`min-h-[32px] rounded-md border-0 px-2.5 py-1.5 text-xs font-bold ${STATUS_CLASS[status] ?? "bg-surface-2 text-ink-2"} ${
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
          action={deleteLead}
          id={lead.id}
          confirmText={`Delete this lead (${lead.name ?? lead.email ?? "unnamed"})? This can't be undone.`}
          className="min-h-[32px] rounded-md border border-[rgba(208,59,59,0.3)] bg-[rgba(208,59,59,0.08)] px-2.5 py-1.5 text-xs font-semibold text-critical hover:bg-[rgba(208,59,59,0.15)]"
        />
      </div>
    </div>
  );
}

export function LeadsPanel({ leads }: { leads: Lead[] }) {
  const followUpCount = leads.filter(needsFollowUp).length;

  return (
    <div className="rounded-2xl border border-black/10 bg-surface p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-ink">Recent leads</h2>
        {followUpCount > 0 && (
          <span className="rounded-full bg-[rgba(208,59,59,0.15)] px-2 py-0.5 text-xs font-bold text-critical">
            {followUpCount} need{followUpCount === 1 ? "s" : ""} follow-up
          </span>
        )}
      </div>
      <div className="mt-3 flex flex-col gap-3">
        {leads.length === 0 ? (
          <div className="rounded-xl border border-dashed border-black/15 py-8 text-center">
            <p className="text-sm font-semibold text-ink">No leads yet</p>
            <p className="mt-1 px-2 text-sm text-muted">
              As enquiries come in through your website, they&apos;ll show up here automatically.
            </p>
          </div>
        ) : (
          leads.map((l) => <LeadRow key={l.id} lead={l} />)
        )}
      </div>
    </div>
  );
}
