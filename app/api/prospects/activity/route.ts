import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasServiceSecret } from "@/lib/serviceAuth";

// Who has opened their preview page - for the owner's local control panel,
// which joins it with phone numbers that never leave the owner's machine to
// make a call list. Server-to-server only, behind the same service secret as
// the import, and engagement facts only: slug, status, channel, view dates.
const PAGE = 1000; // PostgREST's default row cap per request

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
  for (let from = 0; from < 50 * PAGE; from += PAGE) {
    const { data, error } = await admin
      .from("prospects")
      .select("slug, status, channel, view_count, first_viewed_at, last_viewed_at")
      .eq("tenant_id", tenantId)
      .order("slug")
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return NextResponse.json({ prospects: rows });
}
