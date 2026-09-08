"use client";

import { useState, useTransition } from "react";
import { requestReview, recordReview, togglePublishReview, deleteReview } from "@/app/dashboard/actions";
import { DeleteButton } from "@/components/DeleteButton";

type Review = {
  id: string;
  customer_name: string;
  rating: number | null;
  review_text: string | null;
  status: string;
  published: boolean;
};

const field =
  "mt-1 w-full rounded-md border border-black/15 bg-surface px-2.5 py-2 text-base text-ink outline-none focus:border-brand sm:text-sm";
const label = "text-xs font-semibold text-ink-2";

function Stars({ rating }: { rating: number | null }) {
  if (rating == null) return null;
  return <span className="text-[#e0a400]">{"★".repeat(rating)}{"☆".repeat(5 - rating)}</span>;
}

function ReviewRow({ review, projectId }: { review: Review; projectId: string }) {
  const [recording, setRecording] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="border-b border-black/10 py-3 last:border-none">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink">{review.customer_name}</p>
          {review.status === "received" ? (
            <>
              <Stars rating={review.rating} />
              {review.review_text && <p className="mt-1 text-sm text-ink-2">&ldquo;{review.review_text}&rdquo;</p>}
            </>
          ) : (
            <p className="text-xs text-muted">Requested, awaiting response</p>
          )}
        </div>
        <div className="flex flex-none items-center gap-2">
          {review.status === "received" && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => startTransition(() => togglePublishReview(projectId, review.id, !review.published))}
              className={`min-h-[28px] rounded-md px-2 py-1 text-xs font-semibold ${
                review.published ? "bg-[rgba(12,163,12,0.15)] text-good" : "border border-black/10 bg-surface-2 text-ink-2"
              }`}
            >
              {review.published ? "Published" : "Publish"}
            </button>
          )}
          <DeleteButton
            action={deleteReview.bind(null, projectId)}
            id={review.id}
            confirmText={`Delete the review request for ${review.customer_name}?`}
            className="min-h-[28px] rounded-md border border-[rgba(208,59,59,0.3)] bg-[rgba(208,59,59,0.08)] px-2 py-1 text-xs font-semibold text-critical hover:bg-[rgba(208,59,59,0.15)]"
          />
        </div>
      </div>

      {review.status === "requested" && (
        <div className="mt-2">
          {recording ? (
            <form
              action={async (formData) => {
                await recordReview(projectId, review.id, formData);
                setRecording(false);
              }}
              className="flex flex-col gap-2 rounded-lg bg-surface-2 p-2.5"
            >
              <label className={label}>
                Rating
                <select name="rating" defaultValue="5" className={field}>
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>
                      {n} star{n === 1 ? "" : "s"}
                    </option>
                  ))}
                </select>
              </label>
              <label className={label}>
                Review text
                <textarea name="reviewText" rows={2} className={field} />
              </label>
              <button type="submit" className="self-start rounded-md bg-brand px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-strong">
                Save review
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setRecording(true)}
              className="text-xs font-semibold text-brand hover:underline"
            >
              Record response
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function ReviewsPanel({
  tenantId,
  projectId,
  reviews,
}: {
  tenantId: string;
  projectId: string;
  reviews: Review[];
}) {
  return (
    <div className="rounded-2xl border border-black/10 bg-surface p-5 shadow-sm">
      <h2 className="text-sm font-bold text-ink">Reviews</h2>
      <p className="text-xs text-muted">Published reviews show on the customer's website via testimonials.js.</p>

      <form action={requestReview} className="mt-3 flex items-end gap-2 rounded-xl border border-black/10 bg-surface-2 p-3">
        <input type="hidden" name="tenantId" value={tenantId} />
        <input type="hidden" name="projectId" value={projectId} />
        <label className={`${label} flex-1`}>
          Customer name
          <input name="customerName" required className={field} />
        </label>
        <button type="submit" className="rounded-md bg-brand px-3 py-2.5 text-sm font-bold text-white hover:bg-brand-strong">
          Request review
        </button>
      </form>

      <div className="mt-4 flex flex-col">
        {reviews.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">No reviews requested yet.</p>
        ) : (
          reviews.map((r) => <ReviewRow key={r.id} review={r} projectId={projectId} />)
        )}
      </div>
    </div>
  );
}
