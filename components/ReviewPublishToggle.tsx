"use client";

import { useTransition } from "react";
import { togglePublishReview } from "@/app/dashboard/actions";
import { Spinner } from "@/components/Spinner";
import { useToast } from "@/components/Toast";

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
  const { toast } = useToast();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await togglePublishReview(projectId, reviewId, !published);
          toast(published ? "Review unpublished" : "Review published");
        })
      }
      className={`inline-flex min-h-[28px] items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold ${
        published ? "bg-[rgba(12,163,12,0.15)] text-good" : "border border-black/8 bg-surface-2 text-ink-2"
      } ${isPending ? "opacity-60" : ""}`}
    >
      {isPending && <Spinner className="h-3 w-3" />}
      {published ? "Published" : "Publish"}
    </button>
  );
}
