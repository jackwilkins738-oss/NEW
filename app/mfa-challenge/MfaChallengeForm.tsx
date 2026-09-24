"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { Spinner } from "@/components/Spinner";

const field =
  "mt-1 w-full rounded-lg border border-black/15 bg-surface px-3 py-2.5 text-center text-lg tracking-[0.3em] text-ink outline-none transition-colors focus:border-brand";

export function MfaChallengeForm({ returnTo }: { returnTo: string }) {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.mfa.listFactors();
      const factor = (data?.totp ?? []).find((f) => f.status === "verified");
      setFactorId(factor?.id ?? null);
    })();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setPending(true);
    setError(null);
    const supabase = createClient();

    // A fresh challenge every attempt, rather than reusing one across a
    // failed try - simplest way to sidestep whatever a given challenge's
    // own retry/expiry rules are, without needing to special-case them.
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError || !challenge) {
      setPending(false);
      setError("Couldn't reach the verification service. Try again.");
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code: code.trim() });
    if (verifyError) {
      setPending(false);
      setError("That code didn't match. Check the time on your phone and try the next one.");
      setCode("");
      return;
    }

    // A hard navigation, not router.push: proxy.ts needs to see the
    // now-upgraded aal2 session on the very next request, and a client-side
    // route transition wouldn't re-run it.
    window.location.href = returnTo;
  }

  return (
    <form onSubmit={submit} className="mt-4">
      <label className="block text-xs font-semibold text-ink-2">
        6-digit code
        <input
          className={field}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          placeholder="000000"
        />
      </label>
      {error && <p className="mt-2 text-xs font-semibold text-critical">{error}</p>}
      <button
        type="submit"
        disabled={pending || code.length !== 6 || !factorId}
        className="btn-primary mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-strong disabled:opacity-60"
      >
        {pending && <Spinner className="h-3 w-3" />}
        Verify
      </button>
    </form>
  );
}
