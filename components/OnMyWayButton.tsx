"use client";

import { useState } from "react";
import { onMyWay } from "@/lib/contact";

// Opens the phone's own Messages (or WhatsApp) with "on my way" already
// written - free, nothing sent from the dashboard, one tap from the van.
export function OnMyWayButton({ phone, customerName, businessName }: { phone: string | null; customerName: string; businessName: string }) {
  const [minutes, setMinutes] = useState(20);
  const links = onMyWay(phone, customerName, businessName, minutes);
  if (!links.sms && !links.whatsapp) return null;

  const pill = "rounded-lg px-3 py-2 text-xs font-bold";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-xs font-semibold text-ink-2">
        On my way, about{" "}
        <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="rounded-md border border-black/15 bg-surface px-1.5 py-1 text-xs">
          {[10, 15, 20, 30, 45, 60].map((m) => (
            <option key={m} value={m}>
              {m} min
            </option>
          ))}
        </select>
      </label>
      {links.sms && (
        <a href={links.sms} className={`${pill} btn-primary bg-brand text-white hover:bg-brand-strong`}>
          Text them
        </a>
      )}
      {links.whatsapp && (
        <a href={links.whatsapp} target="_blank" rel="noreferrer" className={`${pill} border border-black/15 text-ink hover:bg-surface-2`}>
          WhatsApp
        </a>
      )}
    </div>
  );
}
