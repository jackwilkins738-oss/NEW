import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { decodeState, exchangeConnectCode } from "@/lib/stripe";

// This only ever runs on the one redirect_uri Stripe is configured with
// (admin.scalardigital.co.uk), regardless of which tenant domain started the
// flow - so there's no session cookie to check here, same constraint as the
// Google Calendar callback. Identity instead comes entirely from `state`,
// which is why decodeState() HMAC-signs it (with SUPABASE_SERVICE_ROLE_KEY
// as key material) and checks a 10-minute expiry: without that, anyone could
// build their own {tenantId, returnTo} blob, complete Stripe's OAuth consent
// with their OWN account, and hit this callback directly to re-point a
// victim tenant's payouts at themselves. /api/stripe/connect only ever mints
// a state for a tenant the requesting user is a real member of, so a valid
// signature here is proof of that, not just proof "this app generated it."
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
