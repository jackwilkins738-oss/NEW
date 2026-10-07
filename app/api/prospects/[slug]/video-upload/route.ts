import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasServiceSecret } from "@/lib/serviceAuth";
import { isValidProspectSlug } from "@/lib/prospects";

// The panel's video maker (scripts/auto_video.py) asks here for a one-time upload URL for one
// prospect's walkthrough, PUTs the MP4 straight to storage, then sets it on the preview with
// PATCH /api/prospects/<slug>. Behind the service secret; the bucket only takes MP4s (migration 063).
const BUCKET = "preview-videos";

export async function POST(request: Request, props: { params: Promise<{ slug: string }> }) {
  if (!hasServiceSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { slug } = await props.params;
  if (!isValidProspectSlug(slug)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const admin = createAdminClient();
  const { data: prospect } = await admin.from("prospects").select("slug").eq("slug", slug).maybeSingle();
  if (!prospect) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const path = `${slug.slice(0, 80)}-${randomBytes(4).toString("hex")}.mp4`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    return NextResponse.json({ error: "Uploads aren't available - has migration 063 been run?" }, { status: 503 });
  }
  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ upload_url: data.signedUrl, video_url: pub.publicUrl });
}
