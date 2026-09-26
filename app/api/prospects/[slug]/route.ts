import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasServiceSecret } from "@/lib/serviceAuth";
import { isValidProspectSlug } from "@/lib/prospects";

// The public facts for one preview page. Called server-to-server by the
// Scalar website when it renders /for/<slug> - never from a browser, so the
// prospect list is never enumerable from outside.
export async function GET(request: Request, props: { params: Promise<{ slug: string }> }) {
  if (!hasServiceSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { slug } = await props.params;
  if (!isValidProspectSlug(slug)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const admin = createAdminClient();
  const { data } = await admin
    .from("prospects")
    .select("slug, business_name, trade, area, website, mobile_score, lcp_s, updated_at")
    .eq("slug", slug)
    .maybeSingle();

  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ prospect: data });
}
