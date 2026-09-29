"use client";

import { messageLinks } from "@/lib/contact";

// One tap to a ready-written message in WhatsApp or the phone's own Messages -
// free, sent from the tradesperson's own phone, nothing to type. `text` gets
// this dashboard's address, so links in the message always point at it.
export function MessageButtons({ phone, text, label }: { phone: string | null; text: (origin: string) => string; label: string }) {
  if (!messageLinks(phone, "x").whatsapp && !messageLinks(phone, "x").sms) return null;
  const open = (kind: "whatsapp" | "sms") => {
    const links = messageLinks(phone, text(window.location.origin));
    const url = links[kind];
    if (!url) return;
    if (kind === "whatsapp") window.open(url, "_blank", "noopener");
    else window.location.href = url;
  };
  const cls = "min-h-[32px] rounded-lg border border-black/8 px-2.5 py-1.5 text-xs font-semibold text-ink-2 hover:bg-surface";
  return (
    <span className="inline-flex items-center gap-1.5" title={label}>
      {messageLinks(phone, "x").whatsapp && (
        <button type="button" onClick={() => open("whatsapp")} className={cls}>
          {label}: WhatsApp
        </button>
      )}
      {messageLinks(phone, "x").sms && (
        <button type="button" onClick={() => open("sms")} className={cls}>
          Text
        </button>
      )}
    </span>
  );
}
