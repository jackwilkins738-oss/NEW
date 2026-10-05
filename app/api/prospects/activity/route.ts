import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasServiceSecret } from "@/lib/serviceAuth";

// Who has opened their preview page - for the owner's local control panel,
// which joins it with phone numbers that never leave the owner's machine to
// make a call list. Server-to-server only, behind the same service secret as
// the import, and engagement facts only: slug, status, channel, view dates,
// and when the page got its speed check.
const PAGE = 1000; // PostgREST's default row cap per request
// teardown_at: whether the page has its speed check - the panel re-checks a site whose page has none.
const BASIC = "slug, status, channel, view_count, first_viewed_at, last_viewed_at, teardown_at";
const ENGAGEMENT = "engaged_seconds, max_scroll, reached, choice, choice_at";

export async function GET(request: Request) {
  if (!hasServiceSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenantId = new URL(request.url).searchParams.get("tenant_id") ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
    return NextResponse.json({ error: "Expected ?tenant_id=<uuid>" }, { status: 400 });
  }

  const admin = createAdminClient();
  const rows: unknown[] = [];
  // Engagement (migration 059) when it's there; the basic columns until it's been run.
  let columns = `${BASIC}, ${ENGAGEMENT}`;
  for (let from = 0; from < 50 * PAGE; from += PAGE) {
    let { data, error } = await admin.from("prospects").select(columns).eq("tenant_id", tenantId).order("slug").range(from, from + PAGE - 1);
    if (error && columns !== BASIC) {
      columns = BASIC;
      ({ data, error } = await admin.from("prospects").select(columns).eq("tenant_id", tenantId).order("slug").range(from, from + PAGE - 1));
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return NextResponse.json({ prospects: rows });
}
