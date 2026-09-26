import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasServiceSecret } from "@/lib/serviceAuth";
import { MAX_IMPORT_ROWS, normaliseProspect, type ProspectRow } from "@/lib/prospects";

// Bulk upsert of outreach prospects for one tenant (Scalar's own, in
// practice). Called by the owner's import script, never by a browser.
//
// Unlike /api/leads this sends nothing to anyone - no notification, no
// auto-reply - and isn't rate-limited per IP, because every call comes
// from the same machine by design. The service secret is the gate.
//
// Re-importing is safe: rows are matched on slug, and only the public
// facts are refreshed. Status, view counts and view dates are never sent
// from here, so a re-import can't undo "viewed" or "replied".
export async function POST(request: Request) {
  if (!hasServiceSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { tenant_id?: unknown; prospects?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const tenantId = typeof body.tenant_id === "string" ? body.tenant_id : "";
  if (!tenantId || !Array.isArray(body.prospects)) {
    return NextResponse.json({ error: "Expected { tenant_id, prospects: [] }" }, { status: 400 });
  }
  if (body.prospects.length > MAX_IMPORT_ROWS) {
    return NextResponse.json({ error: `At most ${MAX_IMPORT_ROWS} rows per call` }, { status: 413 });
  }

  const admin = createAdminClient();
  const { data: tenant } = await admin.from("tenants").select("id").eq("id", tenantId).maybeSingle();
  if (!tenant) return NextResponse.json({ error: "Unknown tenant" }, { status: 404 });

  const rows: ProspectRow[] = [];
  const rejected: { index: number; error: string }[] = [];
  const seen = new Set<string>();
  body.prospects.forEach((p, index) => {
    const res = normaliseProspect(p);
    if ("error" in res) rejected.push({ index, error: res.error });
    else if (seen.has(res.row.slug)) rejected.push({ index, error: "duplicate slug in this import" });
    else {
      seen.add(res.row.slug);
      rows.push(res.row);
    }
  });

  if (rows.length === 0) return NextResponse.json({ ok: true, upserted: 0, rejected });

  // A slug is globally unique. Never let one tenant's import overwrite a row
  // belonging to another tenant.
  const { data: clashes } = await admin
    .from("prospects")
    .select("slug")
    .in("slug", rows.map((r) => r.slug))
    .neq("tenant_id", tenantId);
  const clashing = new Set((clashes ?? []).map((c) => c.slug));
  const toWrite = rows.filter((r) => !clashing.has(r.slug));
  for (const slug of clashing) rejected.push({ index: -1, error: `slug taken by another tenant: ${slug}` });

  const now = new Date().toISOString();
  const { error } = await admin
    .from("prospects")
    .upsert(
      toWrite.map((r) => ({ ...r, tenant_id: tenantId, updated_at: now })),
      { onConflict: "slug" }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, upserted: toWrite.length, rejected });
}
