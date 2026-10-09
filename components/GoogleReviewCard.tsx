"use client";

import { useState, useTransition } from "react";
import { draftReviewReply, postGoogleReply } from "@/app/reviews/actions";
import { CopyButton } from "@/components/CopyButton";

export type GoogleReviewView = {
  id: string;
  reviewer: string | null;
  star_rating: number | null;
  comment: string | null;
  reviewed_at: string | null;
  reply: string | null;
};

// One Google review: its reply, or a reply written for the owner to check and post.
export function GoogleReviewCard({ review, canReply }: { review: GoogleReviewView; canReply: boolean }) {
  const [reply, setReply] = useState("");
  const [posted, setPosted] = useState(review.reply);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="border-b border-black/8 py-3 last:border-none">
      <p className="text-sm font-semibold text-ink">
        <span className="text-brand">{"★".repeat(review.star_rating ?? 0)}</span> {review.reviewer ?? "A customer"}
        {review.reviewed_at && (
          <span className="ml-2 text-xs font-normal text-muted">
            {new Date(review.reviewed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
          </span>
        )}
      </p>
      {review.comment && <p className="mt-1 whitespace-pre-line text-sm text-ink-2">{review.comment}</p>}
      {posted ? (
        <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink-2">
          <span className="text-xs font-semibold text-good">Your reply: </span>
          {posted}
        </p>
      ) : canReply ? (
        <div className="mt-2">
          {!reply ? (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await draftReviewReply({ reviewer: review.reviewer ?? "", rating: review.star_rating, text: review.comment ?? "" });
                  if ("error" in r) setMsg(r.error);
                  else setReply(r.reply);
                })
              }
              className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
            >
              {pending ? "Writing..." : "Write a reply"}
            </button>
          ) : (
            <div className="grid gap-2">
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-black/15 bg-surface px-3 py-2 text-sm text-ink"
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await postGoogleReply(review.id, reply);
                      if ("error" in r) setMsg(r.error);
                      else setPosted(reply);
                    })
                  }
                  className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                >
                  Post reply on Google
                </button>
                <CopyButton text={reply} label="Copy" />
              </div>
            </div>
          )}
          {msg && <p className="mt-1 text-xs font-semibold text-critical">{msg}</p>}
        </div>
      ) : (
        <p className="mt-1 text-xs text-muted">Not replied to yet.</p>
      )}
    </div>
  );
}
