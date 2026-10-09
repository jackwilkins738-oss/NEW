"use client";

import { useState, useTransition } from "react";
import { changePlan, createBillingLink, markChangeRequestDone, setWebsiteUrl } from "@/app/admin/actions";
import { PLANS, planLabel, planOf, type Plan } from "@/lib/plans";
import { CopyButton } from "@/components/CopyButton";

export type CareTenant = {
  id: string;
  business_name: string;
  launched_on: string | null;
  billing_status: string | null;
  plan?: string;
  posts?: { waiting: number; live: number } | null;
  website_url?: string | null;
  site_status?: string | null;
};
export type ChangeRequest = { id: string; tenant: string; message: string; created_at: string };

const STATUS: Record<string, [string, string]> = {
  trialing: ["Card on file - billing starts after the free period", "text-good"],
  active: ["Paying", "text-good"],
  past_due: ["Payment failed - get in touch", "text-critical"],
  cancelled: ["Cancelled", "text-muted"],
};

function WebsiteEditor({ t }: { t: CareTenant }) {
  const [url, setUrl] = useState(t.website_url ?? "");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const status = t.site_status === "down" ? ["Down", "text-critical"] : t.site_status === "up" ? ["Up", "text-good"] : t.website_url ? ["Not checked yet", "text-muted"] : null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="their live site, e.g. kerrroofing.co.uk"
        className="min-w-[220px] flex-1 rounded-lg border border-black/15 bg-surface px-2 py-1.5"
      />
      <button
        type="button"
        disabled={pending || url === (t.website_url ?? "")}
        onClick={() => start(async () => { const r = await setWebsiteUrl(t.id, url); setMsg("error" in r ? r.error : "Saved - checked hourly"); })}
        className="rounded-lg border border-black/8 bg-surface-2 px-2.5 py-1.5 font-semibold text-ink-2 disabled:opacity-50"
      >
        Monitor
      </button>
      {status && <span className={`font-semibold ${status[1]}`}>{status[0]}</span>}
      {msg && <span className="text-muted">{msg}</span>}
    </div>
  );
}

function BillingRow({ t, monitorReady, plansReady }: { t: CareTenant; monitorReady: boolean; plansReady: boolean }) {
  const [pending, start] = useTransition();
  const current = planOf(t.plan);
  const [plan, setPlan] = useState<Plan>(current);
  const [result, setResult] = useState<{ url?: string; startsOn?: string; error?: string; changed?: boolean } | null>(null);
  const [label, cls] = STATUS[t.billing_status ?? ""] ?? ["No card yet", "text-muted"];
  const hasCard = t.billing_status === "active" || t.billing_status === "trialing";
  return (
    <li className="border-b border-black/8 py-3 last:border-none">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink">{t.business_name}</p>
          <p className={`text-xs font-semibold ${cls}`}>
            {label}
            {hasCard && ` · ${planLabel(current)}`}
          </p>
          {t.posts && (t.posts.waiting > 0 || t.posts.live > 0) && (
            <p className={`text-xs ${t.posts.waiting > 0 ? "font-semibold text-critical" : "text-muted"}`}>
              Job posts: {t.posts.live} live{t.posts.waiting > 0 && ` · ${t.posts.waiting} waiting for their approval`}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {plansReady && (
            <select
              value={plan}
              onChange={(e) => setPlan(planOf(e.target.value))}
              className="rounded-lg border border-black/15 bg-surface px-2 py-1.5 text-xs"
            >
              {(Object.keys(PLANS) as Plan[]).map((p) => (
                <option key={p} value={p}>
                  {planLabel(p)}
                </option>
              ))}
            </select>
          )}
          {!hasCard && (
            <button
              type="button"
              disabled={pending}
              onClick={() => start(async () => setResult(await createBillingLink(t.id, plan)))}
              className="rounded-lg border border-black/8 bg-surface-2 px-3 py-1.5 text-xs font-semibold text-ink-2 hover:bg-surface disabled:opacity-60"
            >
              Make £{PLANS[plan].pence / 100}/month card link
            </button>
          )}
          {hasCard && plansReady && plan !== current && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!window.confirm(`Move ${t.business_name} to ${planLabel(plan)}? Their card is charged on the new price${plan === "care" ? "" : " from today"}.`)) return;
                start(async () => {
                  const r = await changePlan(t.id, plan);
                  setResult("error" in r ? { error: r.error } : { changed: true });
                });
              }}
              className="rounded-lg border border-black/8 bg-surface-2 px-3 py-1.5 text-xs font-semibold text-ink-2 hover:bg-surface disabled:opacity-60"
            >
              Switch to {PLANS[plan].name}
            </button>
          )}
        </div>
      </div>
      {monitorReady && <WebsiteEditor t={t} />}
      {result?.error && <p className="mt-2 text-xs font-semibold text-critical">{result.error}</p>}
      {result?.changed && <p className="mt-2 text-xs font-semibold text-good">Plan changed - Stripe bills the new price.</p>}
      {result?.url && (
        <div className="mt-2 text-xs text-ink-2">
          <p>
            Send them this. They add a card now; the first £{PLANS[plan].pence / 100} is taken on {result.startsOn}.
          </p>
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
  monitorReady = false,
  plansReady = false,
}: {
  tenants: CareTenant[];
  requests: ChangeRequest[];
  billingReady: boolean;
  requestsReady: boolean;
  monitorReady?: boolean;
  plansReady?: boolean;
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
          <h2 className="text-sm font-bold text-ink">Launched customers: billing and website monitoring</h2>
          <p className="text-xs text-muted">Send a card link at launch - on Care nothing is charged until their free period ends; Growth and Pro bill from the start. Add their live site to have it checked every hour.</p>
          <ul className="mt-2 flex flex-col">
            {tenants.map((t) => (
              <BillingRow key={t.id} t={t} monitorReady={monitorReady} plansReady={plansReady} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
