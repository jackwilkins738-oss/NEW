"use client";

import { useState } from "react";
import { exportPeriods } from "@/lib/accountsExport";

// "For your accountant": pick a period, download the file they want.
export function AccountsExportMenu({ tenantId }: { tenantId: string }) {
  const periods = exportPeriods();
  const [period, setPeriod] = useState(periods[1].key); // last quarter - the usual ask
  const link = (kind: string) => `/api/export/accounts?tenantId=${tenantId}&kind=${kind}&period=${period}`;
  const item = "block rounded-md px-2 py-1.5 text-xs font-semibold text-ink-2 hover:bg-surface-2 hover:text-brand";

  return (
    <details className="relative">
      <summary className="cursor-pointer list-none whitespace-nowrap text-xs font-semibold text-muted hover:text-brand hover:underline">
        Export ▾
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-black/8 bg-surface p-3 shadow-lg">
        <p className="text-xs font-bold text-ink">For your accountant</p>
        <select value={period} onChange={(e) => setPeriod(e.target.value)} className="mt-2 w-full rounded-lg border border-black/15 bg-surface px-2 py-1.5 text-xs">
          {periods.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
        <div className="mt-2 flex flex-col">
          <a href={link("xero")} className={item}>
            Invoices for Xero
          </a>
          <a href={link("invoices")} className={item}>
            Invoices - any software or spreadsheet
          </a>
          <a href={link("costs")} className={item}>
            Job costs and purchases
          </a>
          <a href={`/api/export/invoices?tenantId=${tenantId}`} className={item}>
            Simple invoice list (all)
          </a>
        </div>
        <p className="mt-2 text-[11px] leading-snug text-muted">
          Amounts include VAT. In Xero, choose &quot;Tax inclusive&quot; when importing. If you&apos;re VAT registered, VAT is worked
          out at your default rate - adjust any zero-rated or reduced-rate jobs.
        </p>
      </div>
    </details>
  );
}
