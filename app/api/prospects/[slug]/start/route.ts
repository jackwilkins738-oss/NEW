import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasServiceSecret } from "@/lib/serviceAuth";
import { isValidProspectSlug } from "@/lib/prospects";
import { createProspectQuote } from "@/lib/prospectQuote";

// "See my quote" on a prospect's own preview page, called by the Scalar website's server (never a
// browser), behind the service secret. Makes their quote from the package the owner published
// (POST /api/prospects/quote-template) - or hands back the one already open, so pressing twice
// never makes two. They accept, sign and pay the deposit on the usual quote page.

const PACKAGES = ["build", "landing"];

export async function POST(request: Request, props: { params: Promise<{ slug: string }> }) {
  if (!hasServiceSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { slug } = await props.params;
  if (!isValidProspectSlug(slug)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const pkg = typeof body.package === "string" && PACKAGES.includes(body.package) ? body.package : "";
  if (!pkg) return NextResponse.json({ error: "Unknown package" }, { status: 400 });

  const admin = createAdminClient();
  const { data: prospect } = await admin
    .from("prospects")
    .select("tenant_id, business_name, status")
    .eq("slug", slug)
    .maybeSingle();
  if (!prospect) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (prospect.status === "lost") return NextResponse.json({ error: "Not available" }, { status: 409 });

  const reference = `Started online: ${pkg}`;
  const origin = new URL(request.url).origin;
  // Already started this package and the quote is still open: the same link again.
  const { data: started } = await admin.from("onboarding").select("quote_id").eq("prospect_slug", slug);
  const ids = (started ?? []).map((r: { quote_id: string }) => r.quote_id).filter(Boolean);
  if (ids.length) {
    const today = new Date().toISOString().slice(0, 10);
    const { data: open } = await admin
      .from("quotes")
      .select("id, accept_token, quote_number, total_pence, status, expires_at, reference")
      .in("id", ids)
      .eq("reference", reference);
    const live = (open ?? []).find(
      (q: { status: string; expires_at: string | null }) => ["sent", "accepted"].includes(q.status) && (!q.expires_at || q.expires_at >= today),
    );
    if (live) {
      return NextResponse.json({
        ok: true, reused: true, business_name: prospect.business_name, quote_number: live.quote_number, total_pence: live.total_pence,
        quote_url: `${origin}/quote/${live.id}/${live.accept_token}`,
      });
    }
  }

  const { data: template, error } = await admin
    .from("self_serve_quotes")
    .select("body")
    .eq("tenant_id", prospect.tenant_id)
    .eq("package", pkg)
    .maybeSingle();
  if (error || !template) return NextResponse.json({ error: "Not published" }, { status: 409 });

  const out = await createProspectQuote(
    admin,
    {
      ...(template.body as Record<string, unknown>),
      tenant_id: prospect.tenant_id,
      client_name: prospect.business_name,
      slug,
      reference,
      note: "Started from their preview page - they asked for this quote themselves.",
    },
    origin,
  );
  return NextResponse.json({ ...out.json, reused: false, business_name: prospect.business_name }, { status: out.status });
}
