import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { LEAD_PHOTO_BUCKET, photoExtension, photosProblem } from "@/lib/leadPhotos";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// Step 1 of an enquiry with photos (track.js): the site's public tenant id and
// site key, and what the files are, in; one-time signed upload URLs out. The
// browser uploads each photo straight to private storage, then sends the
// enquiry with their paths (app/api/leads). Same limits as the lead route: a
// real site key, and no more than 5 enquiries' worth from one IP in 10 minutes.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const tenantId = String(body?.tenant_id ?? "");
  const siteKey = String(body?.site_key ?? "");
  const problem = photosProblem(body?.files);
  if (!tenantId || !siteKey || problem) return NextResponse.json({ error: problem ?? "Not found" }, { status: 400, headers: CORS_HEADERS });

  const admin = createAdminClient();
  const { data: tenant } = await admin.from("tenants").select("id, site_key").eq("id", tenantId).maybeSingle();
  if (!tenant || tenant.site_key !== siteKey) return NextResponse.json({ error: "Not found" }, { status: 404, headers: CORS_HEADERS });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  if (ip) {
    const { count } = await admin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("ip", ip)
      .gte("created_at", new Date(Date.now() - 10 * 60_000).toISOString());
    if ((count ?? 0) >= 5) return NextResponse.json({ error: "Not found" }, { status: 404, headers: CORS_HEADERS });
  }

  const uploads = [];
  for (const f of body.files as { type: string }[]) {
    const path = `${tenantId}/pending/${randomUUID()}.${photoExtension(f.type)}`;
    const { data, error } = await admin.storage.from(LEAD_PHOTO_BUCKET).createSignedUploadUrl(path);
    if (error || !data) return NextResponse.json({ error: "Uploads aren't available" }, { status: 503, headers: CORS_HEADERS });
    uploads.push({ path, url: data.signedUrl });
  }
  return NextResponse.json({ uploads }, { headers: CORS_HEADERS });
}
