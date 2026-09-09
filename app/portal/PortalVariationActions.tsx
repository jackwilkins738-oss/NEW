"use client";

import { useState, useTransition } from "react";
import { customerApproveVariation, customerDeclineVariation } from "@/app/portal/actions";

export function PortalVariationActions({
  projectId,
  token,
  variationId,
}: {
  projectId: string;
  token: string;
  variationId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<"approved" | "declined" | null>(null);

  if (result === "approved") {
    return <p className="mt-1.5 text-xs font-semibold text-good">Approved - thanks, we&apos;ll get started.</p>;
  }
  if (result === "declined") {
    return <p className="mt-1.5 text-xs font-semibold text-ink-2">Declined.</p>;
  }

  return (
    <div className="mt-2 flex gap-2">
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const res = await customerApproveVariation(projectId, token, variationId);
            if (res.ok) setResult("approved");
          })
        }
        className="btn-primary rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-strong disabled:opacity-60"
      >
        Approve
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          if (!confirm("Decline this change?")) return;
          startTransition(async () => {
            const res = await customerDeclineVariation(projectId, token, variationId);
            if (res.ok) setResult("declined");
          });
        }}
        className="rounded-lg border border-black/8 bg-surface px-3 py-1.5 text-xs font-semibold text-ink-2 hover:bg-surface-2 disabled:opacity-60"
      >
        Decline
      </button>
    </div>
  );
}
