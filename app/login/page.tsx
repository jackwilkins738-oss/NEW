import { redirect } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { signIn } from "./actions";

const SKIP_WORDS = new Set(["and", "the", "of", "&"]);

function initialsFor(name: string) {
  const words = name.split(/\s+/).filter((w) => w && !SKIP_WORDS.has(w.toLowerCase()) && /[a-z0-9]/i.test(w));
  const letters = words.slice(0, 2).map((w) => w[0]!.toUpperCase());
  return letters.join("") || name.trim()[0]?.toUpperCase() || "?";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const tenant = await getCurrentTenant();
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/dashboard");

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

  return (
    <main className="flex min-h-screen items-center justify-center bg-page px-5 py-10 sm:px-6">
      <div className="w-full max-w-sm">
        <form
          action={signIn}
          className="rounded-[28px] border border-black/10 bg-surface p-7 shadow-[0_1px_2px_rgba(23,20,15,0.06),0_28px_56px_-16px_rgba(139,74,43,0.28)] sm:p-9"
        >
          <div className="flex flex-col items-center text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand font-display text-lg font-bold tracking-wide text-white shadow-[0_10px_22px_-8px_rgba(139,74,43,0.55)]">
              {initialsFor(tenant.business_name)}
            </div>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              Operations &amp; Sales Dashboard
            </p>
            <h1 className="font-display mt-1 text-2xl font-extrabold leading-tight text-ink">
              {tenant.business_name}
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
                className="mt-1.5 w-full rounded-xl border border-black/15 bg-page px-3.5 py-2.5 text-base text-ink shadow-[inset_0_1px_2px_rgba(23,20,15,0.04)] outline-none transition-colors focus:border-brand sm:text-sm"
              />
            </label>

            <label className="block text-sm font-medium text-ink-2">
              Password
              <input
                type="password"
                name="password"
                required
                autoComplete="current-password"
                className="mt-1.5 w-full rounded-xl border border-black/15 bg-page px-3.5 py-2.5 text-base text-ink shadow-[inset_0_1px_2px_rgba(23,20,15,0.04)] outline-none transition-colors focus:border-brand sm:text-sm"
              />
            </label>
          </div>

          <input type="hidden" name="tenantId" value={tenant.id} />

          {searchParams.error && (
            <p className="mt-4 text-sm font-medium text-critical">{searchParams.error}</p>
          )}

          <button
            type="submit"
            className="mt-7 w-full rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white shadow-[0_12px_24px_-10px_rgba(139,74,43,0.6)] transition-colors hover:bg-brand-strong"
          >
            Sign in
          </button>
        </form>
        <p className="mt-5 text-center text-xs text-muted">Powered by Scalar Digital</p>
      </div>
    </main>
  );
}
