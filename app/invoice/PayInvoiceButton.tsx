"use client";

import { useState } from "react";

export function PayInvoiceButton({ invoiceId, token }: { invoiceId: string; token: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          setError(null);
          try {
            const res = await fetch(`/api/invoices/${invoiceId}/checkout`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token }),
            });
            const data = await res.json();
            if (res.ok && data.url) {
              window.location.href = data.url;
            } else {
              setError(data.error ?? "Could not start payment");
              setLoading(false);
            }
          } catch {
            setError("Could not start payment");
            setLoading(false);
          }
        }}
        className="btn-primary w-full rounded-lg bg-brand px-4 py-3 text-sm font-bold text-white hover:bg-brand-strong disabled:opacity-60"
      >
        {loading ? "Redirecting to secure payment…" : "Pay now"}
      </button>
      {error && <p className="mt-2 text-xs text-critical">{error}</p>}
    </div>
  );
}
