"use client";

import { useTransition } from "react";
import { raiseProjectInvoice } from "@/app/dashboard/actions";
import { formatGBP } from "@/lib/format";
import { useToast } from "@/components/Toast";

// One tap from the job to an emailed invoice: the quote's deposit, or
// everything still to bill. The amounts are worked out on the server again
// when pressed (lib/jobs.ts), so a stale page can't double-bill.
export function JobInvoiceButtons({
  projectId,
  tenantId,
  depositPence,
  balancePence,
}: {
  projectId: string;
  tenantId: string;
  depositPence: number;
  balancePence: number;
}) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  if (depositPence <= 0 && balancePence <= 0) return null;

  const raise = (kind: "deposit" | "balance", amount: number) => {
    const what = kind === "deposit" ? "deposit" : "balance";
    if (!window.confirm(`Invoice the ${what} of ${formatGBP(amount)} and email it to the customer?`)) return;
    startTransition(async () => {
      const res = await raiseProjectInvoice(projectId, tenantId, kind);
      if (!res.ok) toast(res.reason === "nothing_to_invoice" ? "Nothing left to invoice" : "Couldn't raise that invoice", "error");
      else if (res.emailed) toast(`Invoice for ${formatGBP(res.amountPence)} emailed`);
      else toast(`Invoice for ${formatGBP(res.amountPence)} raised - no email on file, send it another way`, "error");
    });
  };

  const button =
    "btn-primary rounded-lg bg-brand px-3 py-2 text-xs font-bold text-white hover:bg-brand-strong disabled:opacity-60";
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {depositPence > 0 && (
        <button type="button" disabled={isPending} onClick={() => raise("deposit", depositPence)} className={button}>
          Invoice the deposit ({formatGBP(depositPence)})
        </button>
      )}
      {balancePence > 0 && (
        <button
          type="button"
          disabled={isPending}
          onClick={() => raise("balance", balancePence)}
          className={
            depositPence > 0
              ? "rounded-lg border border-black/15 bg-surface px-3 py-2 text-xs font-bold text-ink hover:bg-surface-2 disabled:opacity-60"
              : button
          }
        >
          Invoice the balance ({formatGBP(balancePence)})
        </button>
      )}
    </div>
  );
}
