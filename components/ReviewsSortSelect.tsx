"use client";

import { useRouter } from "next/navigation";

const SORT_OPTIONS = [
  { value: "newest", label: "Newest requested" },
  { value: "oldest", label: "Oldest requested" },
  { value: "rating_high", label: "Rating: high to low" },
  { value: "rating_low", label: "Rating: low to high" },
  { value: "status", label: "Status" },
];

export function ReviewsSortSelect({ current }: { current: string }) {
  const router = useRouter();

  return (
    <label className="text-xs font-semibold text-ink-2">
      Sort by
      <select
        defaultValue={current}
        onChange={(e) => router.push(`/reviews?sort=${e.target.value}`)}
        className="ml-2 mt-0 rounded-md border border-black/15 bg-surface px-2.5 py-1.5 text-sm text-ink"
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
