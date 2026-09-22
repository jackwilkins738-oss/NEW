"use client";

import { useTransition } from "react";
import { Spinner } from "@/components/Spinner";
import { useToast } from "@/components/Toast";

// Small reusable confirm-then-delete button. Server Actions (unlike plain
// functions) are allowed to cross the server -> client prop boundary, so a
// Server Component can pass one straight in here. Used across 14 call sites
// (leads, invoices, quotes, team, suppliers, reviews, snags, variations,
// admin...), so the pending-spinner and confirmation toast added here cover
// every delete in the app from one place rather than fourteen.
export function DeleteButton({
  action,
  id,
  confirmText,
  className,
  label = "Delete",
  successMessage = "Deleted",
}: {
  // unknown, not void | Promise<void>: some actions (like removeMembership)
  // return a result object rather than nothing, and TypeScript's void-return
  // leniency doesn't reliably cover that - this already caused one build
  // failure earlier by being too narrow. `unknown` accepts any return shape.
  action: (id: string) => unknown;
  id: string;
  confirmText: string;
  className?: string;
  label?: string;
  // Optional per-call-site override ("Lead deleted", "Supplier removed")
  // for callers that want it more specific than the generic default.
  successMessage?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        if (!confirm(confirmText)) return;
        startTransition(async () => {
          await action(id);
          toast(successMessage);
        });
      }}
      className={`${className ?? ""} ${isPending ? "opacity-60" : ""} inline-flex items-center gap-1.5`}
    >
      {isPending && <Spinner className="h-3 w-3" />}
      {label}
    </button>
  );
}
