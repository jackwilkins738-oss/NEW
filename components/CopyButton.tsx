"use client";

import { useState } from "react";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard API can be blocked (permissions, non-HTTPS, older
          // browser) - the text is still visible to select/copy manually,
          // so this just silently leaves the button unchanged rather than
          // showing an error for something the user can work around anyway.
        }
      }}
      className="rounded-md border border-black/10 bg-surface px-2.5 py-1 text-xs font-semibold text-ink-2 hover:bg-brand-tint"
    >
      {copied ? "Copied!" : label}
    </button>
  );
}
