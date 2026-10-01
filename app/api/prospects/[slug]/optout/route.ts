import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasServiceSecret } from "@/lib/serviceAuth";
import { isValidProspectSlug } from "@/lib/prospects";

// "Not for us" on a prospect's preview page. Called by the Scalar website's
// own server route (never a browser), behind the service secret. Marks the
// prospect lost, which the owner's panel reads as do-not-contact: they drop
// out of every batch, follow-up and call list. Idempotent - a second press
// changes nothing. A firm already won is never downgraded.
export async function POST(request: Request, props: { params: Promise<{ slug: string }> }) {
  if (!hasServiceSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { slug } = await props.params;
  if (!isValidProspectSlug(slug)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const admin = createAdminClient();
  const { data: before } = await admin.from("prospects").select("id, business_name, status").eq("slug", slug).maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (before.status !== "won" && before.status !== "lost") {
    const { error } = await admin
      .from("prospects")
      .update({ status: "lost", updated_at: new Date().toISOString() })
      .eq("id", before.id);
    if (error) return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, business_name: before.business_name, changed: before.status !== "won" && before.status !== "lost" });
}
