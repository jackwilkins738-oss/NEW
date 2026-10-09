"use client";

import { useState, useTransition } from "react";
import { loadGbpLocations, setGbpLocation, syncGoogleReviewsNow } from "@/app/admin/actions";
import type { Location } from "@/lib/googleBusiness";

export type GbpTenant = { id: string; business_name: string; gbp_location: string | null };

// Scalar's Google account, and which Business Profile is each client's.
export function GoogleBusinessPanel({
  configured,
  email,
  tenants,
}: {
  configured: boolean;
  email: string | null;
  tenants: GbpTenant[];
}) {
  const [locations, setLocations] = useState<Location[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const label = (name: string | null) => locations?.find((l) => l.name === name)?.title ?? (name ? "Linked" : "Not linked");

  return (
    <div className="mt-5 rounded-2xl border border-black/8 bg-surface p-5 shadow-sm">
      <h2 className="text-sm font-bold text-ink">Google Business Profile</h2>
      {!configured ? (
        <p className="mt-1 text-sm text-muted">
          Waiting for Google&apos;s API approval. Once approved, add GBP_CLIENT_ID and GBP_CLIENT_SECRET (an OAuth client in the approved Google
          Cloud project, redirect URI https://admin.scalardigital.co.uk/api/google-business/callback) in Vercel and redeploy.
        </p>
      ) : !email ? (
        <div className="mt-2">
          <p className="text-sm text-muted">Connect the Google account that&apos;s a manager on your clients&apos; profiles (hello@scalardigital.co.uk).</p>
          <a href="/api/google-business/connect" className="mt-2 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">
            Connect Google account
          </a>
        </div>
      ) : (
        <div className="mt-2">
          <p className="text-sm text-muted">
            Connected as <strong className="text-ink">{email}</strong>. Growth clients&apos; approved job posts go to their profile, and their reviews come in
            daily. <a href="/api/google-business/connect" className="text-brand hover:underline">Reconnect</a>
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await loadGbpLocations();
                if ("error" in r) setMsg(r.error);
                else {
                  setLocations(r.locations);
                  setMsg(r.locations.length ? null : "This account doesn't manage any profiles yet - ask each client to add it as a Manager.");
                }
              })
            }
            className="mt-3 rounded-lg border border-black/8 bg-surface-2 px-3 py-1.5 text-xs font-semibold text-ink-2 disabled:opacity-60"
          >
            {locations ? "Reload profiles" : "Load profiles to link clients"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => start(async () => setMsg((await syncGoogleReviewsNow()).message))}
            className="ml-2 mt-3 rounded-lg border border-black/8 bg-surface-2 px-3 py-1.5 text-xs font-semibold text-ink-2 disabled:opacity-60"
          >
            Sync reviews now
          </button>
          {msg && <p className="mt-2 text-xs font-semibold text-ink-2">{msg}</p>}
          <ul className="mt-3 flex flex-col">
            {tenants.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-black/8 py-2 text-sm last:border-none">
                <span className="font-semibold text-ink">{t.business_name}</span>
                {locations ? (
                  <select
                    defaultValue={t.gbp_location ?? ""}
                    disabled={pending}
                    onChange={(e) =>
                      start(async () => {
                        const r = await setGbpLocation(t.id, e.target.value);
                        setMsg("error" in r ? r.error : null);
                      })
                    }
                    className="max-w-[60%] rounded-lg border border-black/15 bg-surface px-2 py-1.5 text-xs"
                  >
                    <option value="">Not linked</option>
                    {locations.map((l) => (
                      <option key={l.name} value={l.name}>
                        {l.title}
                        {l.address ? ` (${l.address})` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className={`text-xs ${t.gbp_location ? "text-good" : "text-muted"}`}>{label(t.gbp_location)}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
