import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformAdmin } from "@/lib/platformAdmin";
import { decodeState } from "@/lib/googleCalendar";
import { emailFromIdToken, exchangeCode } from "@/lib/googleBusiness";

// No session here (same as the calendar callback): identity comes from the
// signed, 10-minute state - and it must be a platform admin's, sent back to
// /admin, so a calendar state can't be replayed to connect a Google account.
const ADMIN = "https://admin.scalardigital.co.uk/admin";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = decodeState(url.searchParams.get("state") ?? "");
  if (!code || !state || state.returnTo !== ADMIN || !(await isPlatformAdmin(state.userId))) {
    return NextResponse.redirect(`${ADMIN}?gbp=error`);
  }
  try {
    const t = await exchangeCode(code);
    if (!t.refresh_token) throw new Error("No refresh_token - remove Scalar's access in the Google account's security settings, then connect again");
    await createAdminClient()
      .from("google_business_connection")
      .upsert({
        id: "scalar",
        email: emailFromIdToken(t.id_token),
        access_token: t.access_token,
        refresh_token: t.refresh_token,
        token_expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
        connected_at: new Date().toISOString(),
      });
    return NextResponse.redirect(`${ADMIN}?gbp=connected`);
  } catch (err) {
    console.error("Google Business connect failed:", err);
    Sentry.captureException(err);
    return NextResponse.redirect(`${ADMIN}?gbp=error`);
  }
}
