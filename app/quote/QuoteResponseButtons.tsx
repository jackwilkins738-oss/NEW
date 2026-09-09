"use client";

import { useState, useTransition } from "react";
import { acceptQuote, declineQuote } from "@/app/quote/actions";

export function QuoteResponseButtons({ quoteId, token }: { quoteId: string; token: string }) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<"accepted" | "declined" | null>(null);

  if (result === "accepted") {
    return <p className="rounded-lg bg-[rgba(12,163,12,0.1)] p-4 text-sm font-semibold text-good">Quote accepted - thank you. We'll be in touch shortly.</p>;
  }
  if (result === "declined") {
    return <p className="rounded-lg bg-surface-2 p-4 text-sm font-semibold text-ink-2">Quote declined. Thanks for letting us know.</p>;
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const res = await acceptQuote(quoteId, token);
            if (res.ok) setResult("accepted");
          })
        }
        className="btn-primary flex-1 rounded-lg bg-brand px-4 py-3 text-sm font-bold text-white hover:bg-brand-strong disabled:opacity-60"
      >
        Accept quote
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          if (!confirm("Decline this quote?")) return;
          startTransition(async () => {
            const res = await declineQuote(quoteId, token);
            if (res.ok) setResult("declined");
          });
        }}
        className="flex-1 rounded-lg border border-black/8 bg-surface px-4 py-3 text-sm font-semibold text-ink-2 hover:bg-surface-2 disabled:opacity-60"
      >
        Decline
      </button>
    </div>
  );
}
