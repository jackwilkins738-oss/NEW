import { NextResponse, after } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { feedbackMessage, notifyChangeRequest } from "@/lib/changeRequests";

// The "Leave feedback" button on a client's draft site (dash: site_kit's
// preview builds): the client taps a spot on the page and says what they'd
// change, and it lands here as a change request - in /admin with the rest,
// and emailed to the platform admins. Public, like /api/leads, so the same
// rules: the tenant's site_key must match (it's in the draft's page source),
// every field is trimmed, and a burst is quietly refused.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const MAX_PER_HOUR = 40;
const PREFIX = "[Draft site feedback]";

export async function OPTIONS() {
  return new NextResponse(null, { headers: CORS_HEADERS });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
  }
  const tenantId = String(body.tenant_id ?? "");
  const siteKey = String(body.site_key ?? "");
  const message = feedbackMessage(body);
  if (!tenantId || !siteKey || !message) {
    return NextResponse.json({ error: "Say what you'd change." }, { status: 400, headers: CORS_HEADERS });
  }

  const admin = createAdminClient();
  const { data: tenant } = await admin.from("tenants").select("id, site_key").eq("id", tenantId).maybeSingle();
  if (!tenant || tenant.site_key !== siteKey) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: CORS_HEADERS });
  }

  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await admin
    .from("change_requests")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .like("message", `${PREFIX}%`)
    .gte("created_at", hourAgo);
  if ((count ?? 0) >= MAX_PER_HOUR) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: CORS_HEADERS });
  }

  const { error } = await admin.from("change_requests").insert({ tenant_id: tenantId, message });
  if (error) {
    Sentry.captureException(error);
    return NextResponse.json({ error: "Couldn't save that - please try again." }, { status: 500, headers: CORS_HEADERS });
  }
  after(() => notifyChangeRequest(admin, tenantId, message).catch((err) => Sentry.captureException(err)));
  return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
}
