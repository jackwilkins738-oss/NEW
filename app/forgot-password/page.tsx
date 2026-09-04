import { getCurrentTenant } from "@/lib/tenant";
import { initialsFor } from "@/lib/initials";
import { requestPasswordReset } from "./actions";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: { sent?: string };
}) {
  const tenant = await getCurrentTenant();

  if (!tenant) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-page px-6">
        <div className="max-w-sm text-center">
          <p className="font-display text-2xl font-extrabold text-ink">Unrecognised address</p>
          <p className="mt-2 text-sm text-ink-2">
            This domain isn&apos;t linked to a dashboard yet. Check the address, or
            contact whoever set this up.
          </p>
        </div>
      </main>
    );
  }

  const sent = searchParams.sent === "1";

  return (
    <main className="flex min-h-screen items-center justify-center overflow-hidden bg-page px-5 py-10 sm:px-6">
      <div className="relative w-full max-w-sm">
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-x-20 -inset-y-24 -z-10 rounded-full opacity-70 blur-3xl"
          style={{ background: "radial-gradient(closest-side, var(--brand-tint), transparent 72%)" }}
        />

        <div className="login-card-enter rounded-[28px] border border-black/10 bg-surface p-7 shadow-[0_1px_2px_rgba(23,20,15,0.06),0_28px_56px_-16px_rgba(139,74,43,0.28)] sm:p-9">
          <div className="flex flex-col items-center text-center">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-2xl font-display text-lg font-bold tracking-wide text-white shadow-[0_10px_22px_-8px_rgba(139,74,43,0.55),inset_0_1px_0_rgba(255,255,255,0.25)]"
              style={{ background: "linear-gradient(155deg, var(--brand), var(--brand-strong))" }}
            >
              {initialsFor(tenant.business_name)}
            </div>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              {tenant.business_name}
            </p>
            <h1 className="font-display mt-1 text-2xl font-extrabold leading-tight text-ink">Reset password</h1>
          </div>

          {sent ? (
            <div className="mt-6 text-center">
              <p className="text-sm text-ink-2">
                If an account exists for that email, a reset link is on its way. Check your inbox
                (and spam folder) &mdash; it can take a minute or two to arrive.
              </p>
              <a href="/login" className="mt-6 inline-block text-sm font-semibold text-brand hover:underline">
                &larr; Back to sign in
              </a>
            </div>
          ) : (
            <form action={requestPasswordReset} className="mt-7">
              <label className="block text-sm font-medium text-ink-2">
                Email
                <input
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                  className="login-input mt-1.5 w-full rounded-xl border border-black/15 bg-page px-3.5 py-2.5 text-base text-ink shadow-[inset_0_1px_2px_rgba(23,20,15,0.04)] outline-none sm:text-sm"
                />
              </label>

              <button
                type="submit"
                className="login-button mt-6 w-full rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white shadow-[0_12px_24px_-10px_rgba(139,74,43,0.6)] hover:bg-brand-strong"
              >
                Send reset link
              </button>

              <a href="/login" className="mt-4 block text-center text-sm font-semibold text-ink-2 hover:text-brand">
                &larr; Back to sign in
              </a>
            </form>
          )}
        </div>
        <p className="mt-5 text-center text-xs text-muted">Powered by Scalar Digital</p>
      </div>
    </main>
  );
}
