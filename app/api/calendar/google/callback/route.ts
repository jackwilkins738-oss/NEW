import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { decodeState, exchangeCodeForTokens } from "@/lib/googleCalendar";

// This route only ever runs on admin.scalardigital.co.uk (the one redirect
// URI Google is configured with) even though the flow can start from any
// tenant's own domain - so unlike every other authenticated route in this
// app, there's no session cookie to check here (cookies set on
// ridgeview.scalardigital.co.uk aren't sent to a request on
// admin.scalardigital.co.uk). Identity instead comes from `state`, which
// this app generated and signed nothing into but itself controls the
// format of - the actual trust anchor is Google's own `code`, which only
// exists after whoever owns that Google account completed a real consent
// screen for it.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const state = stateParam ? decodeState(stateParam) : null;

  if (!code || !state) {
    return NextResponse.redirect("https://admin.scalardigital.co.uk/login?calendar=error");
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      // Happens if this Google account already granted consent before and
      // Google didn't re-issue a refresh token - the account needs to
      // revoke access in their Google settings and reconnect once.
      throw new Error("No refresh_token in response - account may need to revoke and reconnect");
    }

    const admin = createAdminClient();
    await admin.from("calendar_connections").upsert(
      {
        user_id: state.userId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      },
      { onConflict: "user_id" }
    );

    return NextResponse.redirect(`${state.returnTo}?calendar=connected`);
  } catch (err) {
    console.error("Google Calendar connect failed:", err);
    Sentry.captureException(err);
    return NextResponse.redirect(`${state.returnTo}?calendar=error`);
  }
}
