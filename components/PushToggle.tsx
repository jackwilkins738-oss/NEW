"use client";

import { useEffect, useState } from "react";
import { removePushSubscription, savePushSubscription } from "@/app/account/pushActions";

const KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function keyBytes(base64: string): Uint8Array {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

type State = "loading" | "unsupported" | "ios-home-screen" | "off" | "on" | "blocked";

// "Notifications on this phone": new enquiries and accepted quotes on the
// lock screen (lib/push.ts). Per device - each phone or computer turns it on.
export function PushToggle({ tenantId, compact = false }: { tenantId: string; compact?: boolean }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && !!KEY;
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches;
      if (!supported) return setState(ios && !standalone && KEY ? "ios-home-screen" : "unsupported");
      if (Notification.permission === "denied") return setState("blocked");
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function turnOn() {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "blocked" : "off");
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(KEY) as BufferSource });
      const res = await savePushSubscription(tenantId, sub.toJSON());
      if (!res.ok) {
        await sub.unsubscribe();
        setError(res.error ?? "Couldn't turn them on.");
      } else setState("on");
    } catch {
      setError("Couldn't turn them on on this device.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await removePushSubscription(sub.endpoint);
      await sub.unsubscribe();
    }
    setState("off");
    setBusy(false);
  }

  if (state === "loading" || state === "unsupported") return null;
  if (compact && state === "on") return null;

  const button = "rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-60";
  return (
    <div className={compact ? "flex flex-wrap items-center gap-2" : "rounded-2xl border border-black/8 bg-surface p-5 shadow-sm"}>
      {!compact && <h2 className="text-sm font-bold text-ink">Notifications on this device</h2>}
      {!compact && <p className="mt-1 text-xs text-muted">New enquiries and accepted quotes on your lock screen, the moment they happen.</p>}
      <div className={compact ? "contents" : "mt-3 flex flex-wrap items-center gap-2"}>
        {state === "off" && (
          <button type="button" disabled={busy} onClick={turnOn} className={`${button} btn-primary bg-brand text-white hover:bg-brand-strong`}>
            {compact ? "Get enquiries on this phone" : "Turn on"}
          </button>
        )}
        {state === "on" && (
          <>
            <span className="text-xs font-semibold text-good">On for this device</span>
            <button type="button" disabled={busy} onClick={turnOff} className={`${button} border border-black/15 text-ink-2`}>
              Turn off
            </button>
          </>
        )}
        {state === "blocked" && <span className="text-xs text-muted">Notifications are blocked for this site - allow them in your browser settings.</span>}
        {state === "ios-home-screen" && (
          <span className="text-xs text-muted">On iPhone: tap Share, then Add to Home Screen, and open the dashboard from there to turn on notifications.</span>
        )}
        {error && <span className="text-xs font-semibold text-critical">{error}</span>}
      </div>
    </div>
  );
}
