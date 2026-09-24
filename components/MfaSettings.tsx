"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useToast } from "@/components/Toast";
import { Spinner } from "@/components/Spinner";

type Factor = { id: string; friendlyName: string | null };

const field =
  "mt-1 w-full rounded-lg border border-black/15 bg-surface px-3 py-2.5 text-base text-ink outline-none transition-colors focus:border-brand sm:text-sm";

// Runs entirely against the browser Supabase client, not a Server Action -
// enroll/challenge/verify/unenroll are all inherently "act as the current
// session" operations (Supabase's own SDK handles the AAL bookkeeping),
// and there's no admin-privileged step here that would need a server-only
// client the way most of the rest of this app's mutations do.
export function MfaSettings({ initialFactors }: { initialFactors: Factor[] }) {
  const { toast } = useToast();
  const [factors, setFactors] = useState(initialFactors);
  const [enrolling, setEnrolling] = useState<{ factorId: string; qrCode: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshFactors() {
    const supabase = createClient();
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors((data?.totp ?? []).filter((f) => f.status === "verified").map((f) => ({ id: f.id, friendlyName: f.friendly_name ?? null })));
  }

  async function startEnroll() {
    setError(null);
    setPending(true);
    const supabase = createClient();
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    setPending(false);
    if (enrollError || !data) {
      setError(enrollError?.message ?? "Couldn't start setup. Try again.");
      return;
    }
    setEnrolling({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
  }

  async function confirmEnroll() {
    if (!enrolling) return;
    setError(null);
    setPending(true);
    const supabase = createClient();
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: enrolling.factorId });
    if (challengeError || !challenge) {
      setPending(false);
      setError(challengeError?.message ?? "Couldn't verify that code. Try again.");
      return;
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: enrolling.factorId,
      challengeId: challenge.id,
      code: code.trim(),
    });
    setPending(false);
    if (verifyError) {
      setError("That code didn't match - check the time on your phone is correct and try the next one.");
      return;
    }
    setEnrolling(null);
    setCode("");
    await refreshFactors();
    toast("Two-factor authentication is on");
  }

  async function cancelEnroll() {
    // Supabase auto-removes an enrolled-but-never-verified factor after a
    // while, but there's no reason to leave an abandoned one sitting around
    // in the meantime if they back out here.
    if (enrolling) {
      const supabase = createClient();
      await supabase.auth.mfa.unenroll({ factorId: enrolling.factorId }).catch(() => {});
    }
    setEnrolling(null);
    setCode("");
    setError(null);
  }

  async function removeFactor(factorId: string) {
    if (!confirm("Turn off two-factor authentication? You'll only need your password to sign in after this.")) return;
    setPending(true);
    const supabase = createClient();
    const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId });
    setPending(false);
    if (unenrollError) {
      toast(unenrollError.message);
      return;
    }
    await refreshFactors();
    toast("Two-factor authentication is off");
  }

  if (enrolling) {
    return (
      <div className="rounded-2xl border border-black/8 bg-surface p-5 shadow-sm">
        <h2 className="text-sm font-bold text-ink">Scan this with your authenticator app</h2>
        <p className="mt-1 text-xs text-muted">Google Authenticator, 1Password, Authy - any TOTP app works.</p>
        <div className="mt-4 flex justify-center rounded-xl border border-black/8 bg-white p-4">
          {/* Supabase returns this as a ready-to-use data:image/svg+xml URI - not a user-controlled or remote source, so a plain img is the right call here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enrolling.qrCode} alt="Scan this QR code with your authenticator app" className="h-44 w-44" />
        </div>
        <p className="mt-3 text-center text-xs text-muted">
          Can&rsquo;t scan it? Enter this key manually: <code className="font-mono text-ink-2">{enrolling.secret}</code>
        </p>

        <label className="mt-4 block text-xs font-semibold text-ink-2">
          Enter the 6-digit code from the app
          <input
            className={field}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="000000"
          />
        </label>
        {error && <p className="mt-2 text-xs font-semibold text-critical">{error}</p>}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={pending || code.trim().length !== 6}
            onClick={confirmEnroll}
            className="btn-primary inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-strong disabled:opacity-60"
          >
            {pending && <Spinner className="h-3 w-3" />}
            Verify &amp; turn on
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={cancelEnroll}
            className="rounded-lg px-4 py-2.5 text-sm font-semibold text-ink-2 hover:bg-surface-2"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-black/8 bg-surface p-5 shadow-sm">
      <h2 className="text-sm font-bold text-ink">Two-factor authentication</h2>
      <p className="mt-1 text-xs text-muted">
        {factors.length > 0
          ? "On. Signing in needs a code from your authenticator app as well as your password."
          : "Off. Signing in only needs your password."}
      </p>

      {factors.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2">
          {factors.map((f) => (
            <li key={f.id} className="flex items-center justify-between rounded-lg border border-black/8 bg-surface-2 px-3 py-2.5">
              <span className="text-sm text-ink">{f.friendlyName || "Authenticator app"}</span>
              <button
                type="button"
                disabled={pending}
                onClick={() => removeFactor(f.id)}
                className="text-xs font-semibold text-critical hover:underline disabled:opacity-60"
              >
                Turn off
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={startEnroll}
          className="btn-primary mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-strong disabled:opacity-60"
        >
          {pending && <Spinner className="h-3 w-3" />}
          Turn on two-factor authentication
        </button>
      )}
      {error && !enrolling && <p className="mt-2 text-xs font-semibold text-critical">{error}</p>}
    </div>
  );
}
