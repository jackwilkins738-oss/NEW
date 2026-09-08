"use client";

import { useState, useTransition } from "react";
import { updateTenantContactEmail } from "@/app/dashboard/actions";

// Reply-to address used on emails sent on this tenant's behalf (quotes for
// now, invoices later) - lets a customer's reply land in the tenant's own
// inbox even though the email itself still sends from Scalar's domain.
export function ContactEmailField({ tenantId, contactEmail }: { tenantId: string; contactEmail: string | null }) {
  const [value, setValue] = useState(contactEmail ?? "");
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs font-semibold text-ink-2">
        Reply-to email
        <input
          type="email"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
          onBlur={() => {
            if (value.trim() === (contactEmail ?? "")) return;
            startTransition(async () => {
              await updateTenantContactEmail(tenantId, value);
              setSaved(true);
            });
          }}
          placeholder="you@yourbusiness.co.uk"
          className={`mt-1 block w-full min-w-[220px] rounded-md border border-black/15 bg-surface px-2.5 py-2 text-base text-ink outline-none focus:border-brand sm:text-sm ${
            isPending ? "opacity-60" : ""
          }`}
        />
      </label>
      {saved && !isPending && <span className="text-xs font-semibold text-good">Saved</span>}
    </div>
  );
}
