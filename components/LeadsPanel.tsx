"use client";

import { useMemo, useState, useTransition } from "react";
import { updateLeadStatus, updateLeadValue, updateLeadDetails, convertLeadToProject, deleteLead } from "@/app/dashboard/actions";
import { DeleteButton } from "@/components/DeleteButton";
import { IconUsers } from "@/components/DashboardIcons";
import { PanelSearchInput } from "@/components/PanelSearchInput";

type Lead = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: string;
  value_pence: number | null;
  address: string | null;
  job_type: string | null;
  notes: string | null;
  created_at: string;
};

const STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "survey_booked", label: "Survey booked" },
  { value: "quoted", label: "Quoted" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

const STATUS_CLASS: Record<string, string> = {
  new: "bg-[rgba(250,178,25,0.25)] text-[#8a5a00]",
  contacted: "bg-surface-2 text-ink-2",
  survey_booked: "bg-surface-2 text-ink-2",
  quoted: "bg-surface-2 text-ink-2",
  won: "bg-[rgba(12,163,12,0.15)] text-good",
  lost: "bg-[rgba(208,59,59,0.15)] text-critical",
};

const field =
  "mt-1 w-full rounded-lg border border-black/15 bg-surface px-2.5 py-2 text-base text-ink outline-none focus:border-brand sm:text-sm";
const label = "text-xs font-semibold text-ink-2";

function needsFollowUp(lead: Lead) {
  if (lead.status !== "new") return false;
  const ageHours = (Date.now() - new Date(lead.created_at).getTime()) / 3_600_000;
  return ageHours >= 24;
}

function LeadValueInput({ leadId, valuePence }: { leadId: string; valuePence: number | null }) {
  const [value, setValue] = useState(valuePence != null ? String(valuePence / 100) : "");
  const [isPending, startTransition] = useTransition();

  const commit = () => {
    const trimmed = value.trim();
    const pounds = trimmed === "" ? null : Number(trimmed);
    startTransition(() => {
      updateLeadValue(leadId, pounds !== null && Number.isFinite(pounds) ? pounds : null);
    });
  };

  return (
    <input
      type="number"
      min="0"
      step="1"
      inputMode="decimal"
      value={value}
      disabled={isPending}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      placeholder="Value £"
      aria-label="Lead value in pounds"
      className={`min-h-[32px] w-[84px] rounded-lg border border-black/8 bg-surface px-2 py-1.5 text-xs font-semibold text-ink ${
        isPending ? "opacity-60" : ""
      }`}
    />
  );
}

function ConvertButton({ leadId, tenantId }: { leadId: string; tenantId: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => convertLeadToProject(leadId, tenantId))}
      className={`min-h-[32px] whitespace-nowrap rounded-lg border border-brand/30 bg-brand-tint px-2.5 py-1.5 text-xs font-semibold text-brand-strong hover:bg-brand-tint/80 ${
        isPending ? "opacity-60" : ""
      }`}
    >
      {isPending ? "Converting…" : "Convert to project"}
    </button>
  );
}

function LeadDetails({ lead }: { lead: Lead }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-1.5 text-xs font-semibold text-brand hover:underline">
        {lead.address || lead.job_type || lead.notes ? "Edit details" : "Add address, job type, notes"}
      </button>
    );
  }

  return (
    <form
      action={async (formData) => {
        await updateLeadDetails(lead.id, formData);
        setOpen(false);
      }}
      className="mt-2 flex flex-col gap-2 rounded-lg bg-surface-2 p-2.5"
    >
      <label className={label}>
        Address
        <input name="address" defaultValue={lead.address ?? ""} className={field} />
      </label>
      <label className={label}>
        Job type
        <input name="jobType" defaultValue={lead.job_type ?? ""} className={field} placeholder="e.g. Loft conversion" />
      </label>
      <label className={label}>
        Notes
        <textarea name="notes" rows={2} defaultValue={lead.notes ?? ""} className={field} />
      </label>
      <div className="flex gap-2">
        <button type="submit" className="btn-primary rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-strong">
          Save
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-black/8 px-3 py-1.5 text-xs font-semibold text-ink-2">
          Cancel
        </button>
      </div>
    </form>
  );
}

function LeadRow({ lead, tenantId, converted }: { lead: Lead; tenantId: string; converted: boolean }) {
  const [status, setStatus] = useState(lead.status);
  const [isPending, startTransition] = useTransition();
  const flagged = needsFollowUp({ ...lead, status });

  return (
    <div className="row-hover border-b border-black/8 pb-3 last:border-none last:pb-0">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink">{lead.name ?? lead.email ?? "Unnamed lead"}</p>
          <p className="text-xs text-muted">
            {lead.source ?? "unknown source"}
            {lead.job_type ? ` · ${lead.job_type}` : ""} &middot;{" "}
            {new Date(lead.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
          </p>
          {lead.address && <p className="mt-0.5 text-xs text-muted">{lead.address}</p>}
          {lead.phone && (
            <div className="mt-1.5 flex items-center gap-3">
              <a href={`tel:${lead.phone}`} className="text-xs font-semibold text-brand hover:underline">
                Call {lead.phone}
              </a>
              <a href={`sms:${lead.phone}`} className="text-xs font-semibold text-brand hover:underline">
                Text
              </a>
            </div>
          )}
          {lead.notes && <p className="mt-1 text-xs text-ink-2">{lead.notes}</p>}
          <LeadDetails lead={lead} />
        </div>
        {flagged && (
          <span className="whitespace-nowrap rounded-full bg-[rgba(208,59,59,0.15)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-critical">
            Needs follow-up
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
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
          className={`min-h-[32px] rounded-lg border-0 px-2.5 py-1.5 text-xs font-bold ${STATUS_CLASS[status] ?? "bg-surface-2 text-ink-2"} ${
            isPending ? "opacity-60" : ""
          }`}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <LeadValueInput leadId={lead.id} valuePence={lead.value_pence} />
        {status === "won" && !converted && <ConvertButton leadId={lead.id} tenantId={tenantId} />}
        <DeleteButton
          action={deleteLead}
          id={lead.id}
          confirmText={`Delete this lead (${lead.name ?? lead.email ?? "unnamed"})? This can't be undone.`}
          className="min-h-[32px] rounded-lg border border-[rgba(208,59,59,0.3)] bg-[rgba(208,59,59,0.08)] px-2.5 py-1.5 text-xs font-semibold text-critical hover:bg-[rgba(208,59,59,0.15)]"
        />
      </div>
    </div>
  );
}

export function LeadsPanel({
  leads,
  tenantId,
  convertedLeadIds,
}: {
  leads: Lead[];
  tenantId: string;
  convertedLeadIds: string[];
}) {
  const followUpCount = leads.filter(needsFollowUp).length;
  const converted = new Set(convertedLeadIds);
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((l) =>
      [l.name, l.email, l.phone, l.source, l.job_type, l.address].some((f) => f?.toLowerCase().includes(q))
    );
  }, [leads, query]);

  return (
    <div className="rounded-2xl border border-black/8 bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
          <IconUsers className="h-4 w-4 text-brand" />
          Recent leads
        </h2>
        <div className="flex items-center gap-2">
          {followUpCount > 0 && (
            <span className="rounded-full bg-[rgba(208,59,59,0.15)] px-2 py-0.5 text-xs font-bold text-critical">
              {followUpCount} need{followUpCount === 1 ? "s" : ""} follow-up
            </span>
          )}
          <a
            href={`/api/export/leads?tenantId=${tenantId}`}
            className="whitespace-nowrap text-xs font-semibold text-muted hover:text-brand hover:underline"
          >
            Export CSV
          </a>
        </div>
        {leads.length > 0 && <PanelSearchInput value={query} onChange={setQuery} placeholder="Search leads…" />}
      </div>
      <div className="mt-3 flex flex-col gap-3">
        {leads.length === 0 ? (
          <div className="rounded-xl border border-dashed border-black/15 py-8 text-center">
            <p className="text-sm font-semibold text-ink">No leads yet</p>
            <p className="mt-1 px-2 text-sm text-muted">
              As enquiries come in through your website, they&apos;ll show up here automatically.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No leads match &ldquo;{query}&rdquo;.</p>
        ) : (
          filtered.map((l) => <LeadRow key={l.id} lead={l} tenantId={tenantId} converted={converted.has(l.id)} />)
        )}
      </div>
    </div>
  );
}
