"use client";

import { useRef, useState, useTransition } from "react";
import { submitChangeRequest } from "@/app/help/actions";

export function ChangeRequestForm({ tenantId }: { tenantId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const form = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={form}
      action={(fd) =>
        start(async () => {
          const res = await submitChangeRequest(tenantId, fd);
          setMsg(res.ok ? { ok: true, text: "Sent - you'll hear back within one working day." } : { ok: false, text: res.error });
          if (res.ok) form.current?.reset();
        })
      }
      className="mt-3 flex flex-col gap-3"
    >
      <textarea
        name="message"
        rows={5}
        required
        maxLength={4000}
        placeholder="e.g. Add loft conversions to the services page, and swap the first photo on the home page for the one I'll email over."
        className="w-full rounded-lg border border-black/15 bg-surface px-3 py-2.5 text-base text-ink outline-none focus:border-brand sm:text-sm"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="btn-primary rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-strong disabled:opacity-60"
        >
          {pending ? "Sending..." : "Send request"}
        </button>
        {msg && <span className={`text-sm font-semibold ${msg.ok ? "text-good" : "text-critical"}`}>{msg.text}</span>}
      </div>
    </form>
  );
}
