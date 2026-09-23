import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/tenant";
import { getCurrentUserRole } from "@/lib/membershipRole";
import { buildConnectUrl, encodeState } from "@/lib/stripe";

// Starts the Stripe Connect OAuth flow - a link a signed-in owner clicks
// from Settings, same shape as the Google Calendar connect flow.
export async function GET(request: Request) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.redirect(new URL("/login", request.url));

  const tenant = await getCurrentTenant();
  if (!tenant) return NextResponse.redirect(new URL("/login", request.url));

  // getCurrentTenant() resolves purely from the Host header - never trust
  // that alone for something that changes where money gets paid out.
  const role = await getCurrentUserRole(supabase, tenant.id, userData.user.id);
  if (!role) return NextResponse.redirect(new URL("/login", request.url));

  const returnTo = new URL(request.url).origin + "/settings";
  const state = encodeState({ tenantId: tenant.id, userId: userData.user.id, returnTo });

  return NextResponse.redirect(buildConnectUrl(state));
}
