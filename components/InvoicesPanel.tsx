"use client";

import { useMemo, useState, useTransition } from "react";
import { addInvoice, markInvoicePaid, recordInvoicePayment, deleteInvoice, sendInvoice } from "@/app/dashboard/actions";
import { formatGBP } from "@/lib/format";
import { DeleteButton } from "@/components/DeleteButton";
import { IconBanknote } from "@/components/DashboardIcons";
import { PanelSearchInput } from "@/components/PanelSearchInput";

type Invoice = {
  id: string;
  invoice_number: string | null;
  client_name: string;
  reference: string | null;
  milestone: string | null;
  amount_pence: number;
  paid_pence: number | null;
  due_date: string;
  status: string;
  view_token: string;
  sent_at: string | null;
};

type ProjectOption = { id: string; client_name: string };
type LeadOption = { id: string; name: string | null; email: string | null; status: string };

function invoiceState(inv: Invoice): "paid" | "overdue" | "due_soon" | "upcoming" | "part_paid" {
  if (inv.status === "paid") return "paid";
  if (inv.status === "part_paid") return "part_paid";
  const due = new Date(inv.due_date + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (due < today) return "overdue";
  const daysUntil = (due.getTime() - today.getTime()) / 86_400_000;
  return daysUntil <= 7 ? "due_soon" : "upcoming";
}

const STATE_LABEL: Record<string, string> = {
  paid: "Paid",
  part_paid: "Part paid",
  overdue: "Overdue",
  due_soon: "Due soon",
  upcoming: "Upcoming",
};

const STATE_CLASS: Record<string, string> = {
  paid: "bg-[rgba(12,163,12,0.15)] text-good",
  part_paid: "bg-[rgba(250,178,25,0.25)] text-[#8a5a00]",
  overdue: "bg-[rgba(208,59,59,0.15)] text-critical",
  due_soon: "bg-[rgba(250,178,25,0.25)] text-[#8a5a00]",
  upcoming: "bg-surface-2 text-ink-2",
};

const SORT_RANK: Record<string, number> = { overdue: 0, due_soon: 1, part_paid: 2, upcoming: 3, paid: 4 };

// text-base (16px), not text-sm: iOS Safari auto-zooms into any input under
// 16px on focus, which is a real usability problem on a form meant for a phone.
const field =
  "mt-1 w-full rounded-lg border border-black/15 bg-surface px-2.5 py-2 text-base text-ink outline-none focus:border-brand sm:text-sm";

function RecordPaymentButton({ invoiceId, outstanding }: { invoiceId: string; outstanding: number }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(outstanding / 100));
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-[32px] rounded-lg border border-black/8 bg-surface-2 px-2.5 py-1.5 text-xs font-semibold text-ink-2 hover:bg-[rgba(12,163,12,0.15)] hover:text-good"
      >
        Record payment
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        min="0"
        step="0.01"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="min-h-[32px] w-20 rounded-lg border border-black/15 bg-surface px-2 py-1 text-xs text-ink"
      />
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(() => {
            recordInvoicePayment(invoiceId, Number(amount));
            setOpen(false);
          })
        }
        className="min-h-[32px] rounded-lg bg-brand px-2.5 py-1.5 text-xs font-bold text-white hover:bg-brand-strong"
      >
        Save
      </button>
    </div>
  );
}

function SendInvoiceButton({ invoiceId, tenantId, alreadySent }: { invoiceId: string; tenantId: string; alreadySent: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<"sent" | "no_email" | null>(alreadySent ? "sent" : null);

  if (result === "sent") {
    return <span className="text-xs font-semibold text-good">Sent</span>;
  }
  if (result === "no_email") {
    return <span className="text-xs font-semibold text-critical">No email on file</span>;
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const res = await sendInvoice(invoiceId, tenantId);
          if (res.ok) setResult("sent");
          else if (res.reason === "no_email") setResult("no_email");
        })
      }
      className="btn-primary min-h-[32px] rounded-lg bg-brand px-2.5 py-1.5 text-xs font-bold text-white hover:bg-brand-strong disabled:opacity-60"
    >
      Send invoice
    </button>
  );
}

// A lead only shows up here once it's been marked "contacted" - "new"
// hasn't had a real conversation yet, and anything past "quoted" belongs to
// the quote/project flow instead. Picking one autofills the client name and
// tags the invoice with lead_id (no customer record is created - a lead
// only gets one of those by actually being won).
function NewInvoiceForm({
  tenantId,
  projects,
  leads,
}: {
  tenantId: string;
  projects: ProjectOption[];
  leads: LeadOption[];
}) {
  const [clientName, setClientName] = useState("");
  const [leadId, setLeadId] = useState("");
  const contactedLeads = leads.filter((l) => l.status === "contacted");

  return (
    <form
      action={addInvoice}
      className="mt-3 grid grid-cols-1 gap-2 rounded-xl border border-black/8 bg-surface-2 p-3 sm:grid-cols-6 sm:items-end"
    >
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="leadId" value={leadId} />
      {contactedLeads.length > 0 && (
        <label className="text-xs font-semibold text-ink-2 sm:col-span-2">
          Recent contacted lead
          <select
            value={leadId}
            onChange={(e) => {
              const id = e.target.value;
              setLeadId(id);
              const lead = contactedLeads.find((l) => l.id === id);
              if (lead) setClientName(lead.name ?? lead.email ?? "");
            }}
            className={field}
          >
            <option value="">Not from a lead</option>
            {contactedLeads.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name ?? l.email ?? "Unnamed lead"}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="text-xs font-semibold text-ink-2">
        Client
        <input
          name="clientName"
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          required
          className={field}
        />
      </label>
      <label className="text-xs font-semibold text-ink-2">
        Project
        <select name="projectId" defaultValue="" className={field}>
          <option value="">Not linked</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.client_name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs font-semibold text-ink-2">
        Milestone
        <input name="milestone" className={field} placeholder="Deposit / Stage 1 / Final" />
      </label>
      <label className="text-xs font-semibold text-ink-2">
        Reference
        <input name="reference" className={field} />
      </label>
      <label className="text-xs font-semibold text-ink-2">
        Amount (&pound;)
        <input name="amount" type="number" min="0" step="0.01" required className={field} />
      </label>
      <label className="text-xs font-semibold text-ink-2">
        Due date
        <input name="dueDate" type="date" required className={field} />
      </label>
      <button
        type="submit"
        className="btn-primary rounded-lg bg-brand px-3 py-2.5 text-sm font-bold text-white hover:bg-brand-strong sm:col-span-6 sm:w-auto sm:justify-self-start sm:py-1.5"
      >
        Add
      </button>
    </form>
  );
}

export function InvoicesPanel({
  tenantId,
  invoices,
  projects,
  leads,
}: {
  tenantId: string;
  invoices: Invoice[];
  projects: ProjectOption[];
  leads: LeadOption[];
}) {
  const sorted = [...invoices].sort((a, b) => {
    const rankDiff = SORT_RANK[invoiceState(a)] - SORT_RANK[invoiceState(b)];
    if (rankDiff !== 0) return rankDiff;
    return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
  });
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((inv) =>
      [inv.client_name, inv.invoice_number, inv.reference, inv.milestone].some((f) => f?.toLowerCase().includes(q))
    );
  }, [sorted, query]);

  return (
    <div className="rounded-2xl border border-black/8 bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
          <IconBanknote className="h-4 w-4 text-brand" />
          Invoices
        </h2>
        <div className="flex items-center gap-2">
          <a
            href={`/api/export/invoices?tenantId=${tenantId}`}
            className="whitespace-nowrap text-xs font-semibold text-muted hover:text-brand hover:underline"
          >
            Export CSV
          </a>
          {invoices.length > 0 && <PanelSearchInput value={query} onChange={setQuery} placeholder="Search invoices…" />}
        </div>
      </div>

      <NewInvoiceForm tenantId={tenantId} projects={projects} leads={leads} />

      <div className="mt-4 flex flex-col gap-3">
        {sorted.length === 0 && (
          <div className="rounded-xl border border-dashed border-black/15 py-8 text-center">
            <p className="text-sm font-semibold text-ink">No invoices yet</p>
            <p className="mt-1 text-sm text-muted">Add one above to start tracking what&apos;s owed and when it&apos;s due.</p>
          </div>
        )}
        {sorted.length > 0 && filtered.length === 0 && (
          <p className="py-6 text-center text-sm text-muted">No invoices match &ldquo;{query}&rdquo;.</p>
        )}
        {filtered.map((inv) => {
          const state = invoiceState(inv);
          const outstanding = inv.amount_pence - (inv.paid_pence ?? 0);
          return (
            <div
              key={inv.id}
              className="row-hover flex flex-col gap-2 border-b border-black/8 pb-3 last:border-none last:pb-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-semibold text-ink">
                  {inv.client_name}
                  {inv.milestone && <span className="font-normal text-muted"> &middot; {inv.milestone}</span>}
                </p>
                <p className="text-xs text-muted">
                  {inv.invoice_number ?? "no number"}
                  {inv.reference ? ` · ${inv.reference}` : ""} &middot; due{" "}
                  {new Date(inv.due_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                  {state === "part_paid" && ` · ${formatGBP(outstanding)} outstanding`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold text-ink">{formatGBP(inv.amount_pence)}</span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATE_CLASS[state]}`}>
                  {STATE_LABEL[state]}
                </span>
                <a
                  href={`/api/invoices/${inv.id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-h-[32px] items-center rounded-lg border border-black/8 px-2.5 py-1.5 text-xs font-semibold text-ink-2 hover:bg-surface-2"
                >
                  PDF
                </a>
                <SendInvoiceButton invoiceId={inv.id} tenantId={tenantId} alreadySent={!!inv.sent_at} />
                {inv.status !== "paid" && (
                  <>
                    <RecordPaymentButton invoiceId={inv.id} outstanding={outstanding} />
                    <form action={markInvoicePaid.bind(null, inv.id)}>
                      <button
                        type="submit"
                        className="min-h-[32px] rounded-lg border border-black/8 bg-surface-2 px-2.5 py-1.5 text-xs font-semibold text-ink-2 hover:bg-[rgba(12,163,12,0.15)] hover:text-good"
                      >
                        Mark fully paid
                      </button>
                    </form>
                  </>
                )}
                <DeleteButton
                  action={deleteInvoice}
                  id={inv.id}
                  confirmText={`Delete the invoice for ${inv.client_name}? This can't be undone.`}
                  className="min-h-[32px] rounded-lg border border-[rgba(208,59,59,0.3)] bg-[rgba(208,59,59,0.08)] px-2.5 py-1.5 text-xs font-semibold text-critical hover:bg-[rgba(208,59,59,0.15)]"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
