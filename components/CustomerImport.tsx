"use client";

import { useState, useTransition } from "react";
import { importCustomers } from "@/app/dashboard/actions";
import { customersFromCsv, type ImportedCustomer } from "@/lib/customerImport";

// "Bring your customers across": pick a CSV, check the count, import.
export function CustomerImport({ tenantId }: { tenantId: string }) {
  const [rows, setRows] = useState<ImportedCustomer[] | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <details className="mt-5 rounded-2xl border border-black/8 bg-surface p-5 shadow-sm">
      <summary className="cursor-pointer text-sm font-bold text-ink">Import customers from a spreadsheet</summary>
      <p className="mt-2 text-xs text-muted">
        Save your list as CSV (Excel: File → Save As → CSV). The first row needs column names such as Name, Email, Phone,
        Address, Notes. Anyone already here with the same email is left as they are.
      </p>
      <input
        type="file"
        accept=".csv,text/csv"
        className="mt-3 text-sm"
        onChange={async (e) => {
          setNote(null);
          setRows(null);
          const file = e.target.files?.[0];
          if (!file) return;
          if (file.size > 5 * 1024 * 1024) {
            setNote({ ok: false, text: "That file is over 5 MB - split it up." });
            return;
          }
          const result = customersFromCsv(await file.text());
          if (result.error) setNote({ ok: false, text: result.error });
          else {
            setRows(result.customers);
            setNote({
              ok: true,
              text: `${result.customers.length} customers ready${result.skipped ? ` (${result.skipped} blank or repeated rows left out)` : ""}.`,
            });
          }
        }}
      />
      {note && <p className={`mt-2 text-sm font-semibold ${note.ok ? "text-ink-2" : "text-critical"}`}>{note.text}</p>}
      {rows && rows.length > 0 && (
        <>
          <ul className="mt-2 text-xs text-muted">
            {rows.slice(0, 3).map((r, i) => (
              <li key={i}>
                {r.name}
                {r.email ? ` · ${r.email}` : ""}
                {r.phone ? ` · ${r.phone}` : ""}
              </li>
            ))}
            {rows.length > 3 && <li>...and {rows.length - 3} more</li>}
          </ul>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await importCustomers(tenantId, rows);
                setRows(null);
                setNote(
                  res.ok
                    ? { ok: true, text: `Imported ${res.added}.${res.existing ? ` ${res.existing} were already here.` : ""}` }
                    : { ok: false, text: res.error }
                );
              })
            }
            className="btn-primary mt-3 rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-strong disabled:opacity-60"
          >
            {pending ? "Importing..." : `Import ${rows.length} customers`}
          </button>
        </>
      )}
    </details>
  );
}
