import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasServiceSecret } from "@/lib/serviceAuth";
import { isValidProspectSlug } from "@/lib/prospects";
import { normaliseAnswers } from "@/lib/onboarding";

// What a website client sent from their onboarding page, for the outreach
// panel's "Draft their site" (scripts/site_draft.py): their answers, and
// one-hour download links for their logo and photos. Server-to-server only,
// guarded by PROSPECTS_API_SECRET like the rest of /api/prospects.
export async function GET(request: Request) {
  if (!hasServiceSecret(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const slug = new URL(request.url).searchParams.get("slug") ?? "";
  if (!isValidProspectSlug(slug)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("onboarding")
    .select("id, client_name, answers, submitted_at, updated_at")
    .eq("prospect_slug", slug)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: files } = await admin
    .from("onboarding_files")
    .select("filename, kind, storage_path")
    .eq("onboarding_id", row.id)
    .order("created_at");
  const withUrls = await Promise.all(
    (files ?? []).map(async (f) => {
      const { data } = await admin.storage.from("onboarding-uploads").createSignedUrl(f.storage_path, 3600);
      return { filename: f.filename, kind: f.kind, url: data?.signedUrl ?? null };
    })
  );
  return NextResponse.json({
    client_name: row.client_name,
    submitted_at: row.submitted_at,
    updated_at: row.updated_at,
    answers: normaliseAnswers(row.answers),
    files: withUrls.filter((f) => f.url),
  });
}
