"use client";

import { useState, useTransition } from "react";
import { resetDemoTenant } from "@/app/admin/actions";

// Sets up the sales demo the first time, and refreshes its data after that
// (it also refreshes itself every morning). Shows where to sign in to it.
export function DemoResetButton() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string; url?: string } | null>(null);

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const res = await resetDemoTenant();
            setResult(res.ok ? { ok: true, text: "Demo ready - sign in with your own login:", url: res.url } : { ok: false, text: res.error });
          })
        }
        className="w-full rounded-lg border border-black/8 bg-surface-2 px-3 py-2.5 text-sm font-semibold text-ink disabled:opacity-60 sm:w-auto sm:py-2"
      >
        {isPending ? "Filling the demo..." : "Reset demo"}
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
