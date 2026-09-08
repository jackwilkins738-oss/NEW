"use client";

import { useTransition } from "react";
import { togglePublishReview } from "@/app/dashboard/actions";

export function ReviewPublishToggle({
  projectId,
  reviewId,
  published,
}: {
  projectId: string;
  reviewId: string;
  published: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => togglePublishReview(projectId, reviewId, !published))}
      className={`min-h-[28px] rounded-md px-2 py-1 text-xs font-semibold ${
        published ? "bg-[rgba(12,163,12,0.15)] text-good" : "border border-black/10 bg-surface-2 text-ink-2"
      } ${isPending ? "opacity-60" : ""}`}
    >
      {published ? "Published" : "Publish"}
    </button>
  );
}
