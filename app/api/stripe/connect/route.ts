import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/tenant";
import { getCurrentUserRole } from "@/lib/membershipRole";
import { buildConnectUrl, encodeState } from "@/lib/stripe";

// Starts the Stripe Connect OAuth flow - a link a signed-in owner clicks
// from Settings, same shape as the Google Calendar connect flow.
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.redirect(new URL("/login", request.url));

  const tenant = await getCurrentTenant();
  if (!tenant) return NextResponse.redirect(new URL("/login", request.url));

  // getCurrentTenant() resolves purely from the Host header - never trust
  // that alone for something that changes where money gets paid out.
  //
  // Must be owner, not just any member: this route mints the state that
  // the callback uses to overwrite tenants.stripe_account_id, so a member
  // completing their own Stripe OAuth consent here would silently redirect
  // every future customer payment to their own Stripe account instead of
  // the business's. The Settings page already hides this behind an
  // owner-only gate (app/settings/page.tsx) - this route is reachable
  // directly regardless of what the page shows, so it needs the same check.
  const role = await getCurrentUserRole(supabase, tenant.id, userData.user.id);
  if (role !== "owner") return NextResponse.redirect(new URL("/login", request.url));

  const returnTo = new URL(request.url).origin + "/settings";
  const state = encodeState({ tenantId: tenant.id, userId: userData.user.id, returnTo });

  return NextResponse.redirect(buildConnectUrl(state));
}
