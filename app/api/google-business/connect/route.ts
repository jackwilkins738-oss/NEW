import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/platformAdmin";
import { encodeState } from "@/lib/googleCalendar";
import { buildAuthUrl, googleBusinessConfigured } from "@/lib/googleBusiness";

// Connects Scalar's Google account (the manager on clients' Business
// Profiles) - platform admins only, from /admin.
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user || !(await isPlatformAdmin(data.user.id))) return NextResponse.redirect(new URL("/login", request.url));
  if (!googleBusinessConfigured()) return NextResponse.redirect(new URL("/admin?gbp=not-configured", request.url));
  const state = encodeState({ userId: data.user.id, returnTo: "https://admin.scalardigital.co.uk/admin" });
  return NextResponse.redirect(buildAuthUrl(state));
}
