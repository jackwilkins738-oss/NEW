import { redirect } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { initialsFor } from "@/lib/initials";
import { isPlatformAdmin } from "@/lib/platformAdmin";
import { brandThemeStyleTag } from "@/lib/theme";
import { signIn, adminSignIn } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const tenant = await getCurrentTenant();
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) {
    if (tenant) {
      redirect("/dashboard");
    } else if (await isPlatformAdmin(data.user.id)) {
      redirect("/admin");
    }
    // Signed in, but neither a member of a tenant on this domain nor a
    // platform admin - fall through to the sign-in form rather than
    // redirect anywhere, which would just bounce right back here (a loop).
  }

  // No tenant matches this domain - by design, that's what the admin domain
  // looks like (it doesn't belong to any customer). Rather than a dead end,
  // show a generic sign-in that checks platform_admins instead of a
  // tenant membership, so there's still a way back in if a session expires.
  const isAdminDomain = !tenant;

  return (
    <main className="flex min-h-screen items-center justify-center overflow-hidden bg-page px-5 py-10 sm:px-6">
      {tenant && <style dangerouslySetInnerHTML={{ __html: brandThemeStyleTag(tenant.brand_theme) }} />}
      <div className="relative w-full max-w-sm">
        {/* Abstract brand-tinted glow, not literal imagery - reads as premium
            for any customer's brand color without needing per-industry art. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-x-20 -inset-y-24 -z-10 rounded-full opacity-70 blur-3xl"
          style={{ background: "radial-gradient(closest-side, var(--brand-tint), transparent 72%)" }}
        />

        <form
          action={isAdminDomain ? adminSignIn : signIn}
          className="login-card-enter rounded-[28px] border border-black/10 bg-surface p-7 shadow-[0_1px_2px_rgba(23,20,15,0.06),0_28px_56px_-16px_rgba(23,20,15,0.28)] sm:p-9"
        >
          <div className="flex flex-col items-center text-center">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-2xl font-display text-lg font-bold tracking-wide text-white shadow-[0_10px_22px_-8px_rgba(23,20,15,0.55),inset_0_1px_0_rgba(255,255,255,0.25)]"
              style={{ background: "linear-gradient(155deg, var(--brand), var(--brand-strong))" }}
            >
              {initialsFor(tenant ? tenant.business_name : "Scalar Digital")}
            </div>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              {tenant ? "Operations & Sales Dashboard" : "Scalar Digital"}
            </p>
            <h1 className="font-display mt-1 text-2xl font-extrabold leading-tight text-ink">
              {tenant ? tenant.business_name : "Admin sign in"}
            </h1>
          </div>

          <div className="mt-7 flex flex-col gap-4">
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

            <label className="block text-sm font-medium text-ink-2">
              Password
              <input
                type="password"
                name="password"
                required
                autoComplete="current-password"
                className="login-input mt-1.5 w-full rounded-xl border border-black/15 bg-page px-3.5 py-2.5 text-base text-ink shadow-[inset_0_1px_2px_rgba(23,20,15,0.04)] outline-none sm:text-sm"
              />
            </label>
            {!isAdminDomain && (
              <a href="/forgot-password" className="-mt-2 self-end text-xs font-semibold text-brand hover:underline">
                Forgot password?
              </a>
            )}
          </div>

          {tenant && <input type="hidden" name="tenantId" value={tenant.id} />}

          {searchParams.error && (
            <p className="mt-4 text-sm font-medium text-critical">{searchParams.error}</p>
          )}

          <button
            type="submit"
            className="login-button mt-7 w-full rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white shadow-[0_12px_24px_-10px_rgba(23,20,15,0.6)] hover:bg-brand-strong"
          >
            Sign in
          </button>
        </form>
        {isAdminDomain && (
          <a
            href="https://ridgeview.scalardigital.co.uk/login"
            className="mt-4 block text-center text-xs font-semibold text-brand hover:underline"
          >
            Go to Ridgeview dashboard login &rarr;
          </a>
        )}
        <p className="mt-5 text-center text-xs text-muted">
          Powered by Scalar Digital &middot; <a href="/privacy" className="hover:text-brand hover:underline">Privacy</a> &middot;{" "}
          <a href="/terms" className="hover:text-brand hover:underline">Terms</a>
        </p>
      </div>
    </main>
  );
}
