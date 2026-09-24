import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Routes reachable with only an aal1 (password-only) session - everything
// else requires aal2 once a user has a verified TOTP factor. Public token
// pages (portal/quote/invoice) and the machine-to-machine API routes below
// aren't gated on a *user* session at all (they have their own, separate
// auth model - a token, a cron secret, a Stripe signature), so redirecting
// them into a login/MFA flow would just break them.
//
// This is NOT a blanket "/api/" exemption - routes like /api/export/invoices
// and /api/*/pdf trust a plain user session (getUser() + RLS) the same way
// a dashboard page does, so they stay behind the gate. Exempting all of
// /api/ would let an aal1-only session (e.g. the window between password
// login and completing the TOTP prompt) reach those directly and skip 2FA
// entirely - the token-based branch of the dual-mode routes (customer
// viewing a quote/invoice via ?token=) never hits this check anyway, since
// it only applies when getUser() actually returns a signed-in user.
const AAL_EXEMPT_PREFIXES = [
  "/login",
  "/mfa-challenge",
  "/forgot-password",
  "/reset-password",
  "/auth/",
  "/api/webhooks/",
  "/api/cron/",
  "/api/stripe/",
  "/api/calendar/google/",
  "/api/leads",
  "/invoice/",
  "/quote/",
  "/portal/",
  "/track.js",
  "/gallery.js",
  "/portfolio.js",
  "/testimonials.js",
];

// Keeps the Supabase auth session cookie fresh on every request (standard
// @supabase/ssr pattern). Tenant resolution itself happens in lib/tenant.ts,
// which reads the Host header directly via next/headers() in server
// components - no need to thread anything through middleware for that.
export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const exempt = AAL_EXEMPT_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));

  if (user && !exempt) {
    // nextLevel only ever reports "aal2" once this user has a verified TOTP
    // factor - opt-in by construction, not something this check has to
    // gate on separately. currentLevel !== nextLevel means they've proven
    // their password this session but not yet their authenticator.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== aal.nextLevel) {
      const redirectUrl = new URL("/mfa-challenge", request.url);
      redirectUrl.searchParams.set("returnTo", pathname);
      const redirectResponse = NextResponse.redirect(redirectUrl);
      // The cookie refresh above was written onto `response`, not this new
      // redirect response - copy it across, or a session mid-refresh could
      // look logged-out on the very next request.
      response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
      return redirectResponse;
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|track.js).*)",
  ],
};
