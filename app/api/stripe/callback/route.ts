import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { decodeState, exchangeConnectCode } from "@/lib/stripe";

// Same constraint as the Google Calendar callback: this only ever runs on
// the one redirect_uri Stripe is configured with (admin.scalardigital.co.uk),
// regardless of which tenant domain started the flow - so identity comes
// from `state` (which this app generated), not a session cookie. The real
// trust anchor is Stripe's own `code`, which only exists after whoever owns
// that Stripe account completed a real OAuth consent screen for it.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const state = stateParam ? decodeState(stateParam) : null;
  const error = url.searchParams.get("error");

  if (error || !code || !state) {
    return NextResponse.redirect(`${state?.returnTo ?? "https://admin.scalardigital.co.uk/login"}?stripe=error`);
  }

  try {
    const result = await exchangeConnectCode(code);
    const admin = createAdminClient();
    await admin.from("tenants").update({ stripe_account_id: result.stripe_user_id }).eq("id", state.tenantId);
    return NextResponse.redirect(`${state.returnTo}?stripe=connected`);
  } catch (err) {
    console.error("Stripe connect failed:", err);
    Sentry.captureException(err);
    return NextResponse.redirect(`${state.returnTo}?stripe=error`);
  }
}
