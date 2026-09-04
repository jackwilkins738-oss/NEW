"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/browser";
import { initialsFor } from "@/lib/initials";

type Status = "checking" | "ready" | "invalid" | "success";

export default function ResetPasswordPage() {
  const [status, setStatus] = useState<Status>("checking");
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    // The recovery link's tokens land in the URL hash; the browser client
    // (detectSessionInUrl, on by default) picks them up and establishes a
    // session automatically on load - if that session exists, the link was
    // valid. No session means it was already used, expired, or malformed.
    supabase.auth.getSession().then(({ data }) => {
      setStatus(data.session ? "ready" : "invalid");
    });

    const host = window.location.hostname;
    supabase
      .from("tenants")
      .select("business_name")
      .or(`domain.eq.${host},slug.eq.${host.split(".")[0]}`)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.business_name) setBusinessName(data.business_name);
      });
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    setStatus("success");
  }

  return (
    <main className="flex min-h-screen items-center justify-center overflow-hidden bg-page px-5 py-10 sm:px-6">
      <div className="relative w-full max-w-sm">
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-x-20 -inset-y-24 -z-10 rounded-full opacity-70 blur-3xl"
          style={{ background: "radial-gradient(closest-side, var(--brand-tint), transparent 72%)" }}
        />

        <div className="login-card-enter rounded-[28px] border border-black/10 bg-surface p-7 shadow-[0_1px_2px_rgba(23,20,15,0.06),0_28px_56px_-16px_rgba(23,20,15,0.28)] sm:p-9">
          <div className="flex flex-col items-center text-center">
            {businessName && (
              <div
                className="flex h-14 w-14 items-center justify-center rounded-2xl font-display text-lg font-bold tracking-wide text-white shadow-[0_10px_22px_-8px_rgba(23,20,15,0.55),inset_0_1px_0_rgba(255,255,255,0.25)]"
                style={{ background: "linear-gradient(155deg, var(--brand), var(--brand-strong))" }}
              >
                {initialsFor(businessName)}
              </div>
            )}
            {businessName && (
              <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{businessName}</p>
            )}
            <h1 className="font-display mt-1 text-2xl font-extrabold leading-tight text-ink">Set new password</h1>
          </div>

          {status === "checking" && <p className="mt-6 text-center text-sm text-ink-2">Checking your link&hellip;</p>}

          {status === "invalid" && (
            <div className="mt-6 text-center">
              <p className="text-sm text-ink-2">This link is invalid or has expired.</p>
              <a href="/forgot-password" className="mt-6 inline-block text-sm font-semibold text-brand hover:underline">
                Request a new one
              </a>
            </div>
          )}

          {status === "ready" && (
            <form onSubmit={handleSubmit} className="mt-7">
              <label className="block text-sm font-medium text-ink-2">
                New password
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  className="login-input mt-1.5 w-full rounded-xl border border-black/15 bg-page px-3.5 py-2.5 text-base text-ink shadow-[inset_0_1px_2px_rgba(23,20,15,0.04)] outline-none sm:text-sm"
                />
              </label>

              <label className="mt-4 block text-sm font-medium text-ink-2">
                Confirm password
                <input
                  type="password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  className="login-input mt-1.5 w-full rounded-xl border border-black/15 bg-page px-3.5 py-2.5 text-base text-ink shadow-[inset_0_1px_2px_rgba(23,20,15,0.04)] outline-none sm:text-sm"
                />
              </label>

              {error && <p className="mt-4 text-sm font-medium text-critical">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="login-button mt-6 w-full rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white shadow-[0_12px_24px_-10px_rgba(23,20,15,0.6)] hover:bg-brand-strong disabled:opacity-60"
              >
                {submitting ? "Saving…" : "Set new password"}
              </button>
            </form>
          )}

          {status === "success" && (
            <div className="mt-6 text-center">
              <p className="text-sm text-ink-2">Your password has been updated.</p>
              <a
                href="/dashboard"
                className="login-button mt-6 inline-block w-full rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white shadow-[0_12px_24px_-10px_rgba(23,20,15,0.6)] hover:bg-brand-strong"
              >
                Go to dashboard
              </a>
            </div>
          )}
        </div>
        <p className="mt-5 text-center text-xs text-muted">Powered by Scalar Digital</p>
      </div>
    </main>
  );
}
