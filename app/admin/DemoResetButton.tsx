"use client";

import { useState, useTransition } from "react";
import { resetDemoTenant } from "@/app/admin/actions";

// Sets up the sales demo the first time, and refreshes its data after that
// (it also refreshes itself every morning). Shows where to sign in to it.
// "Show as" puts a prospect's firm name on it for one call; the morning
// refresh puts the made-up name back.
export function DemoResetButton() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string; url?: string } | null>(null);
  const [showAs, setShowAs] = useState("");

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <input
        type="text"
        value={showAs}
        onChange={(e) => setShowAs(e.target.value)}
        maxLength={60}
        placeholder="Show as (prospect's firm, optional)"
        aria-label="Show the demo as this firm"
        className="w-full rounded-lg border border-black/8 bg-surface px-3 py-2 text-sm sm:w-64"
      />
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const res = await resetDemoTenant(showAs);
            setResult(res.ok ? { ok: true, text: "Demo ready - sign in with your own login:", url: res.url } : { ok: false, text: res.error });
          })
        }
        className="w-full rounded-lg border border-black/8 bg-surface-2 px-3 py-2.5 text-sm font-semibold text-ink disabled:opacity-60 sm:w-auto sm:py-2"
      >
        {isPending ? "Filling the demo..." : showAs.trim() ? `Reset demo as ${showAs.trim()}` : "Reset demo"}
      </button>
      {result && (
        <p className={`text-xs ${result.ok ? "text-good" : "text-critical"}`}>
          {result.text}{" "}
          {result.url && (
            <a href={result.url} target="_blank" rel="noopener" className="underline">
              {result.url.replace(/^https:\/\//, "")}
            </a>
          )}
        </p>
      )}
    </div>
  );
}
