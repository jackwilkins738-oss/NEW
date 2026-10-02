import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasServiceSecret } from "@/lib/serviceAuth";
import { isValidProspectSlug } from "@/lib/prospects";

// How long a prospect spent on their preview page and how far they got
// (migration 059). Called by the Scalar website's own server when the page is
// put away, so the call list can say "2m40s, scrolled to the price" and put
// the genuinely interested first. Engagement facts only.
const SECTIONS = new Set(["loading", "rebuilt", "race", "findings", "pricing", "reply"]);

export async function POST(request: Request, props: { params: Promise<{ slug: string }> }) {
  if (!hasServiceSecret(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { slug } = await props.params;
  if (!isValidProspectSlug(slug)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const int = (v: unknown, max: number) => Math.min(max, Math.max(0, Math.round(Number(v) || 0)));
  const reached = Array.isArray(body.reached) ? [...new Set(body.reached.map(String).filter((s) => SECTIONS.has(s)))] : [];
  const { error } = await createAdminClient().rpc("record_prospect_engagement", {
    p_slug: slug,
    p_seconds: int(body.seconds, 1800),
    p_scroll: int(body.scroll, 100),
    p_reached: reached,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 503 });
  return NextResponse.json({ ok: true });
}
