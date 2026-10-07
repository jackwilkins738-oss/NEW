import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasServiceSecret } from "@/lib/serviceAuth";

// Quotes sent to prospects that are still open (not accepted, declined or expired), with how often each
// has been opened (migration 057) - for the owner's panel, whose Telegram bot chases the ones opened
// but not accepted after two days. Server-to-server only, behind the service secret.
type Quote = {
  id: string; accept_token: string; quote_number: string | null; total_pence: number; status: string;
  expires_at: string | null; sent_at: string | null; created_at: string; view_count: number | null;
  first_viewed_at: string | null; last_viewed_at: string | null; reference: string | null;
};

export async function GET(request: Request) {
  if (!hasServiceSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenantId = new URL(request.url).searchParams.get("tenant_id") ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
    return NextResponse.json({ error: "Expected ?tenant_id=<uuid>" }, { status: 400 });
  }
  const admin = createAdminClient();
  const { data: links, error } = await admin
    .from("onboarding")
    .select("quote_id, prospect_slug, client_name")
    .eq("tenant_id", tenantId)
    .limit(2000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  type Link = { quote_id: string; prospect_slug: string | null; client_name: string };
  const bySlug = new Map(((links ?? []) as Link[]).filter((l) => l.prospect_slug).map((l) => [l.quote_id, l]));
  if (bySlug.size === 0) return NextResponse.json({ quotes: [] });

  // How often each was opened comes from migration 057; until it's run, the quotes still list
  // (without views, so none is chased) and the answer says what's missing.
  const BASE = "id, accept_token, quote_number, total_pence, status, expires_at, sent_at, created_at, reference";
  const ids = [...bySlug.keys()];
  const read = (cols: string) => admin.from("quotes").select(cols).eq("tenant_id", tenantId).in("id", ids).eq("status", "sent");
  let viewsMissing = false;
  let { data: quotes, error: qError } = await read(`${BASE}, view_count, first_viewed_at, last_viewed_at`);
  if (qError) {
    viewsMissing = true;
    ({ data: quotes, error: qError } = await read(BASE));
  }
  if (qError) return NextResponse.json({ error: qError.message }, { status: 500 });

  const today = new Date().toISOString().slice(0, 10);
  const origin = new URL(request.url).origin;
  const open = ((quotes ?? []) as unknown as Quote[])
    .filter((q) => !q.expires_at || q.expires_at >= today)
    .map((q) => {
      const link = bySlug.get(q.id)!;
      return {
        slug: link.prospect_slug, business_name: link.client_name, quote_number: q.quote_number, total_pence: q.total_pence,
        sent_at: q.sent_at ?? q.created_at, view_count: q.view_count ?? 0, first_viewed_at: q.first_viewed_at,
        last_viewed_at: q.last_viewed_at, started_online: (q.reference ?? "").startsWith("Started online"),
        quote_url: `${origin}/quote/${q.id}/${q.accept_token}`,
      };
    });
  return NextResponse.json(viewsMissing ? { quotes: open, warning: "Run migration 057 - quote views aren't recorded yet" } : { quotes: open });
}
