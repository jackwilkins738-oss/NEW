import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Every invite/magic-link/reset link this app generates points here now,
// instead of straight at Supabase's own /auth/v1/verify redirect. That
// redirect hands session tokens back in the URL hash fragment, and
// @supabase/ssr's browser client is unreliable at picking those up -
// documented, version-dependent bug (supabase/ssr#21, among others), not
// something a flowType setting fixes. Verifying the token_hash here
// server-side instead sets the session as a cookie directly - the user
// already has a session by the time they land on `next`, no client-side
// token parsing involved at all.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/dashboard";

  if (tokenHash && type) {
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/reset-password?error=invalid`);
}
