import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasServiceSecret } from "@/lib/serviceAuth";
import { planIncludes } from "@/lib/plans";
import { sendEmail } from "@/lib/email";
import { tenantOrigin } from "@/lib/tenantOrigin";
import { draftReadyEmail, jobsDue, parseDraft } from "@/lib/jobPosts";

// Job posts (migration 065), for the owner's panel - server-to-server only,
// behind the service secret.
//   GET   ?tenant_id=   finished jobs due a post (facts and photos only: the job type, town and photo
//                       captions - never the customer's name, the price or notes), and every approved or
//                       published post, for building into their site
//   POST  a draft       saved for the client to approve on /posts, and they're emailed
//   PATCH {id, tenant_id, page_url}   an approved post is now live on their site
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const photoBase = () => `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/project-photos/`;
const MISSING = "Run migration 065 (job posts) in Supabase first";

export async function GET(request: Request) {
  if (!hasServiceSecret(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenantId = new URL(request.url).searchParams.get("tenant_id") ?? "";
  if (!UUID.test(tenantId)) return NextResponse.json({ error: "Expected ?tenant_id=<uuid>" }, { status: 400 });
  const admin = createAdminClient();
  const { data: tenant } = await admin.from("tenants").select("id, plan").eq("id", tenantId).maybeSingle();
  if (!tenant) return NextResponse.json({ error: "No such tenant" }, { status: 404 });

  const { data: posts, error } = await admin
    .from("job_posts")
    .select("id, project_id, status, title, slug, body, google_post, town, service, photos, page_url, approved_at, published_at")
    .eq("tenant_id", tenantId);
  if (error) return NextResponse.json({ error: MISSING }, { status: 500 });
  const live = (posts ?? []).filter((p) => p.status === "approved" || p.status === "published");
  if (!planIncludes(tenant.plan, "seo_pages")) return NextResponse.json({ plan: tenant.plan, due: [], posts: live });

  const since = new Date(Date.now() - 61 * 86_400_000).toISOString();
  const { data: projects } = await admin
    .from("projects")
    .select("id, project_type, location, completed_at")
    .eq("tenant_id", tenantId)
    .gte("completed_at", since);
  const ids = (projects ?? []).map((p) => p.id);
  const { data: photos } = ids.length
    ? await admin.from("project_photos").select("project_id, storage_path, caption").in("project_id", ids).order("created_at")
    : { data: [] as { project_id: string; storage_path: string; caption: string | null }[] };
  const photosBy = new Map<string, { url: string; caption: string }[]>();
  for (const p of photos ?? []) {
    const list = photosBy.get(p.project_id) ?? [];
    if (list.length < 8) list.push({ url: photoBase() + p.storage_path, caption: p.caption ?? "" });
    photosBy.set(p.project_id, list);
  }
  const drafted = new Set((posts ?? []).map((p) => p.project_id));
  const due = jobsDue(
    (projects ?? []).map((p) => ({ id: p.id, completed_at: p.completed_at, photo_count: photosBy.get(p.id)?.length ?? 0 })),
    drafted,
    Date.now()
  ).map((j) => {
    const p = projects!.find((x) => x.id === j.id)!;
    return { project_id: p.id, project_type: p.project_type, location: p.location, completed_at: p.completed_at, photos: photosBy.get(p.id) };
  });
  return NextResponse.json({ plan: tenant.plan, due, posts: live });
}

export async function POST(request: Request) {
  if (!hasServiceSecret(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const input = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const tenantId = typeof input?.tenant_id === "string" ? input.tenant_id : "";
  if (!UUID.test(tenantId)) return NextResponse.json({ error: "Expected tenant_id" }, { status: 400 });
  const draft = parseDraft(input, photoBase());
  if ("error" in draft) return NextResponse.json(draft, { status: 400 });
  const admin = createAdminClient();
  const { data: project } = await admin.from("projects").select("id").eq("id", draft.project_id).eq("tenant_id", tenantId).maybeSingle();
  if (!project) return NextResponse.json({ error: "That job isn't this tenant's" }, { status: 404 });
  const { data: taken } = await admin.from("job_posts").select("id").eq("tenant_id", tenantId).eq("slug", draft.slug);
  const slug = taken?.length ? `${draft.slug.slice(0, 73)}-${draft.project_id.slice(0, 6)}` : draft.slug;
  const { data: row, error } = await admin
    .from("job_posts")
    .insert({ ...draft, slug, tenant_id: tenantId, status: "draft" })
    .select("id")
    .single();
  if (error) {
    const duplicate = error.code === "23505";
    return NextResponse.json({ error: duplicate ? "That job already has a post" : MISSING }, { status: duplicate ? 409 : 500 });
  }
  try {
    const { data: t } = await admin.from("tenants").select("business_name, contact_email, domain, slug").eq("id", tenantId).maybeSingle();
    if (t?.contact_email) {
      await sendEmail({ to: [t.contact_email], ...draftReadyEmail(t.business_name, draft.title, `${tenantOrigin(t)}/posts`) });
    }
  } catch (err) {
    Sentry.captureException(err);
  }
  return NextResponse.json({ id: row.id, slug });
}

export async function PATCH(request: Request) {
  if (!hasServiceSecret(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const input = (await request.json().catch(() => null)) as { id?: string; tenant_id?: string; page_url?: string } | null;
  if (!UUID.test(input?.id ?? "") || !UUID.test(input?.tenant_id ?? "")) return NextResponse.json({ error: "Expected id and tenant_id" }, { status: 400 });
  const pageUrl = (input?.page_url ?? "").trim();
  if (!/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}\/\S*$/i.test(pageUrl) || pageUrl.length > 300) {
    return NextResponse.json({ error: "page_url must be the https address of the page" }, { status: 400 });
  }
  const { data, error } = await createAdminClient()
    .from("job_posts")
    .update({ status: "published", page_url: pageUrl, published_at: new Date().toISOString() })
    .eq("id", input!.id!)
    .eq("tenant_id", input!.tenant_id!)
    .in("status", ["approved", "published"])
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "No approved post with that id" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
