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
    .select("slug, business_name, trade, area, website, mobile_score, lcp_s, teardown, teardown_at, updated_at")
    .eq("slug", slug)
    .maybeSingle();

  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ prospect: data });
}

// A prospect's right to erasure (UK GDPR): the owner's panel deletes their
// preview record here, behind the service secret, when they ask. A firm that
// became a client ("won") is refused - their record is part of a contract and
// is handled by hand. Quotes sent to them (onboarding rows) are left in place
// and counted, so the panel can say so.
export async function DELETE(request: Request, props: { params: Promise<{ slug: string }> }) {
  if (!hasServiceSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { slug } = await props.params;
  if (!isValidProspectSlug(slug)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const admin = createAdminClient();
  const { data: before } = await admin.from("prospects").select("id, status").eq("slug", slug).maybeSingle();
  if (!before) return NextResponse.json({ ok: true, deleted: false });
  if (before.status === "won") {
    return NextResponse.json({ error: "This firm is a client - their record is kept with their contract." }, { status: 409 });
  }
  const { error } = await admin.from("prospects").delete().eq("id", before.id);
  if (error) return NextResponse.json({ error: "Could not delete" }, { status: 500 });
  const { data: quotes } = await admin.from("onboarding").select("id").eq("prospect_slug", slug);
  return NextResponse.json({ ok: true, deleted: true, quotes: (quotes ?? []).length });
}
