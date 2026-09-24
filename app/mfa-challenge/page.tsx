import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import { MfaChallengeForm } from "./MfaChallengeForm";

export const dynamic = "force-dynamic";

// Only ever reached via proxy.ts's redirect, for a session that's
// authenticated (aal1) but has a verified TOTP factor still waiting to be
// satisfied (aal2) - never a page someone would otherwise navigate to
// directly with anything left to do here.
// Only a same-site relative path is ever allowed - "//evil.example" is
// technically a "/"-prefixed string too but browsers treat it as
// protocol-relative to an external host, so that's excluded explicitly
// rather than just checking the first character.
function safeReturnTo(value: string | undefined): string {
  if (value && value.startsWith("/") && !value.startsWith("//")) return value;
  return "/dashboard";
}

export default async function MfaChallengePage(props: { searchParams: Promise<{ returnTo?: string }> }) {
  const searchParams = await props.searchParams;
  const returnTo = safeReturnTo(searchParams.returnTo);
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!aal || aal.currentLevel === aal.nextLevel) {
    // Already satisfied (or nothing to satisfy) - nothing for this page to
    // do, and proxy.ts would just bounce them straight back here in a loop
    // if it rendered the form anyway.
    redirect(returnTo);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-page px-6 py-12">
      <div className="w-full max-w-sm rounded-2xl border border-black/8 bg-surface p-6 shadow-sm">
        <h1 className="font-display text-xl font-bold text-ink">Enter your code</h1>
        <p className="mt-1 text-sm text-muted">Open your authenticator app and enter the current 6-digit code.</p>

        <MfaChallengeForm returnTo={returnTo} />

        <form action={signOut} className="mt-4 border-t border-black/8 pt-4">
          <button type="submit" className="text-xs font-semibold text-muted hover:text-ink-2">
            Lost access to your authenticator? Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
