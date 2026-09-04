import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildAuthUrl, encodeState } from "@/lib/googleCalendar";

// Starts the OAuth flow. Requires an existing dashboard session - this
// isn't a public endpoint, it's a link a signed-in user clicks from their
// own dashboard.
export async function GET(request: Request) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.redirect(new URL("/login", request.url));

  const returnTo = new URL(request.url).origin + "/dashboard";
  const state = encodeState({ userId: userData.user.id, returnTo });

  return NextResponse.redirect(buildAuthUrl(state));
}
