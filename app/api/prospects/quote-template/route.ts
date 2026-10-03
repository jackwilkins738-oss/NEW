import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasServiceSecret } from "@/lib/serviceAuth";
import { parseLineItems } from "@/lib/quoteMath";

// The owner's panel publishes the quote a prospect gets from "See my quote" on their preview: the
// same body it sends to POST /api/prospects/quote, minus who it's for. Stored per package
// (migration 060) and used by POST /api/prospects/[slug]/start.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PACKAGES = ["build", "landing"];
const KEEP = ["line_items", "vat_rate", "deposit_percent", "payment_terms", "exclusions", "terms", "optional_items", "expires_days"];

export async function POST(request: Request) {
  if (!hasServiceSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const tenantId = typeof body.tenant_id === "string" && UUID.test(body.tenant_id) ? body.tenant_id : "";
  const pkg = typeof body.package === "string" && PACKAGES.includes(body.package) ? body.package : "";
  const quote = body.quote && typeof body.quote === "object" ? (body.quote as Record<string, unknown>) : null;
  if (!tenantId || !pkg || !quote) {
    return NextResponse.json({ error: "Expected tenant_id, package and quote" }, { status: 400 });
  }
  if (parseLineItems(JSON.stringify(quote.line_items ?? [])).length === 0) {
    return NextResponse.json({ error: "The quote needs a line item" }, { status: 400 });
  }
  if (typeof quote.terms !== "string" || quote.terms.trim().length < 50) {
    // A self-serve client signs "including its terms": never publish a quote without them.
    return NextResponse.json({ error: "The quote needs its terms of business" }, { status: 400 });
  }
  const stored = Object.fromEntries(KEEP.filter((k) => k in quote).map((k) => [k, quote[k]]));
  const { error } = await createAdminClient()
    .from("self_serve_quotes")
    .upsert({ tenant_id: tenantId, package: pkg, body: stored, updated_at: new Date().toISOString() });
  if (error) {
    const missing = /self_serve_quotes/.test(error.message ?? "");
    return NextResponse.json({ error: missing ? "Run migration 060 first" : "Could not save" }, { status: missing ? 409 : 500 });
  }
  return NextResponse.json({ ok: true });
}
