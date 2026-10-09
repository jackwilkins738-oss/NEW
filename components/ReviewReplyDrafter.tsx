"use client";

import { useState, useTransition } from "react";
import { draftReviewReply } from "@/app/reviews/actions";
import { CopyButton } from "@/components/CopyButton";

const field = "w-full rounded-lg border border-black/15 bg-surface px-3 py-2 text-sm text-ink";

// Paste a Google review in, get a reply to check and post (lib/reviewReplies.ts).
export function ReviewReplyDrafter() {
  const [reviewer, setReviewer] = useState("");
  const [rating, setRating] = useState("");
  const [text, setText] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="text-xs font-semibold text-muted">
          Their name, as on Google
          <input value={reviewer} onChange={(e) => setReviewer(e.target.value)} maxLength={60} className={`mt-1 ${field}`} />
        </label>
        <label className="text-xs font-semibold text-muted">
          Stars
          <select value={rating} onChange={(e) => setRating(e.target.value)} className={`mt-1 ${field}`}>
            <option value="">-</option>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {"★".repeat(n)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="text-xs font-semibold text-muted">
        The review
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={3000} className={`mt-1 ${field}`} />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await draftReviewReply({ reviewer, rating: rating ? Number(rating) : null, text });
              if ("error" in r) setError(r.error);
              else setReply(r.reply);
            })
          }
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Writing..." : reply ? "Write another version" : "Write a reply"}
        </button>
        {error && <span className="text-xs font-semibold text-critical">{error}</span>}
      </div>
      {reply && (
        <div className="rounded-xl bg-surface-2 p-3">
          <label className="text-xs font-semibold text-muted">
            Your reply - change anything you like
            <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={5} className={`mt-1 ${field}`} />
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <CopyButton text={reply} label="Copy the reply" />
            <a
              href="https://business.google.com/reviews"
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-black/8 bg-surface px-3 py-1.5 text-xs font-semibold text-ink-2"
            >
              Open your Google reviews
            </a>
          </div>
          <p className="mt-2 text-xs text-muted">There, find the review, press Reply and paste.</p>
        </div>
      )}
    </div>
  );
}
