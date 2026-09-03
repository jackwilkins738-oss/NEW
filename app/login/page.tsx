import { redirect } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { signIn } from "./actions";

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
      <main className="min-h-screen flex items-center justify-center bg-page px-6">
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
    <main className="min-h-screen flex items-center justify-center bg-page px-6">
      <form
        action={signIn}
        className="w-full max-w-sm rounded-2xl border border-black/10 bg-surface p-8 shadow-lg"
      >
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          Operations &amp; Sales Dashboard
        </p>
        <h1 className="font-display mt-1 text-2xl font-extrabold text-ink">
          {tenant.business_name}
        </h1>

        <label className="mt-6 block text-sm font-medium text-ink-2">
          Email
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            className="mt-1 w-full rounded-lg border border-black/15 bg-page px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          />
        </label>

        <label className="mt-4 block text-sm font-medium text-ink-2">
          Password
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            className="mt-1 w-full rounded-lg border border-black/15 bg-page px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          />
        </label>

        <input type="hidden" name="tenantId" value={tenant.id} />

        {searchParams.error && (
          <p className="mt-4 text-sm font-medium text-critical">{searchParams.error}</p>
        )}

        <button
          type="submit"
          className="mt-6 w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-strong"
        >
          Sign in
        </button>
      </form>
    </main>
  );
}
