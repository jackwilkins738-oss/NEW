"use client";

import { useState, useTransition } from "react";
import { sendReviewRequestEmail } from "@/app/dashboard/actions";

export function ReviewSendRequestButton({
  projectId,
  tenantId,
  reviewId,
}: {
  projectId: string;
  tenantId: string;
  reviewId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<"sent" | "no_review_link" | "no_email" | null>(null);

  if (result === "sent") {
    return <span className="text-xs font-semibold text-good">Sent</span>;
  }
  if (result === "no_review_link") {
    return <span className="text-xs font-semibold text-critical">Set a Google review link in Settings first</span>;
  }
  if (result === "no_email") {
    return <span className="text-xs font-semibold text-critical">No email on file for this customer</span>;
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const res = await sendReviewRequestEmail(projectId, tenantId, reviewId);
          if (res.ok) setResult("sent");
          else if (res.reason === "no_review_link") setResult("no_review_link");
          else if (res.reason === "no_email") setResult("no_email");
        })
      }
      className="min-h-[28px] rounded-lg border border-black/8 bg-surface-2 px-2 py-1 text-xs font-semibold text-ink-2 hover:bg-surface disabled:opacity-60"
    >
      Send request
    </button>
  );
}
