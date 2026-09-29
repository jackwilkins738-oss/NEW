"use client";

import { useState, useTransition } from "react";
import { createBillingLink, markChangeRequestDone } from "@/app/admin/actions";
import { CopyButton } from "@/components/CopyButton";

export type CareTenant = {
  id: string;
  business_name: string;
  launched_on: string | null;
  billing_status: string | null;
};
export type ChangeRequest = { id: string; tenant: string; message: string; created_at: string };

const STATUS: Record<string, [string, string]> = {
  trialing: ["Card on file - billing starts after the free period", "text-good"],
  active: ["Paying £39/month", "text-good"],
  past_due: ["Payment failed - get in touch", "text-critical"],
  cancelled: ["Cancelled", "text-muted"],
};

function BillingRow({ t }: { t: CareTenant }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ url?: string; startsOn?: string; error?: string } | null>(null);
  const [label, cls] = STATUS[t.billing_status ?? ""] ?? ["No card yet", "text-muted"];
  return (
    <li className="border-b border-black/8 py-3 last:border-none">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink">{t.business_name}</p>
          <p className={`text-xs font-semibold ${cls}`}>{label}</p>
        </div>
        {t.billing_status !== "active" && t.billing_status !== "trialing" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => start(async () => setResult(await createBillingLink(t.id)))}
            className="rounded-lg border border-black/8 bg-surface-2 px-3 py-1.5 text-xs font-semibold text-ink-2 hover:bg-surface disabled:opacity-60"
          >
            Make £39/month card link
          </button>
        )}
      </div>
      {result?.error && <p className="mt-2 text-xs font-semibold text-critical">{result.error}</p>}
      {result?.url && (
        <div className="mt-2 text-xs text-ink-2">
          <p>Send them this. They add a card now; the first £39 is taken on {result.startsOn}.</p>
          <div className="mt-1 flex items-start gap-2">
            <code className="flex-1 overflow-x-auto whitespace-pre rounded bg-surface-2 px-2 py-1.5">{result.url}</code>
            <CopyButton text={result.url} />
          </div>
        </div>
      )}
    </li>
  );
}

export function ClientCarePanel({
  tenants,
  requests,
  billingReady,
  requestsReady,
}: {
  tenants: CareTenant[];
  requests: ChangeRequest[];
  billingReady: boolean;
  requestsReady: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <div className="mt-5 grid gap-5">
      {requestsReady && (
        <div className="rounded-2xl border border-black/8 bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-bold text-ink">Change requests</h2>
          {requests.length === 0 ? (
            <p className="mt-2 text-sm text-muted">None open.</p>
          ) : (
            <ul className="mt-2 flex flex-col">
              {requests.map((r) => (
                <li key={r.id} className="border-b border-black/8 py-3 last:border-none">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        {r.tenant}{" "}
                        <span className="text-xs font-normal text-muted">
                          {new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </span>
                      </p>
                      <p className="mt-1 whitespace-pre-line text-sm text-ink-2">{r.message}</p>
                    </div>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => start(() => markChangeRequestDone(r.id))}
                      className="flex-none rounded-lg border border-black/8 bg-surface-2 px-3 py-1.5 text-xs font-semibold text-good hover:bg-surface disabled:opacity-60"
                    >
                      Done
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {billingReady && tenants.length > 0 && (
        <div className="rounded-2xl border border-black/8 bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-bold text-ink">Dashboard billing (£39/month)</h2>
          <p className="text-xs text-muted">Launched customers. Best sent at launch - nothing is charged until their free period ends.</p>
          <ul className="mt-2 flex flex-col">
            {tenants.map((t) => (
              <BillingRow key={t.id} t={t} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
