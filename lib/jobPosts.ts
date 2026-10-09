import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { tenantOrigin } from "@/lib/tenantOrigin";

// Job posts (migration 065): a finished job with photos -> a page on the
// client's website and a Google Business Profile post. The owner's panel
// drafts them through /api/job-posts; the client approves on /posts.

const DAY = 86_400_000;
export const RECENT_DAYS = 60;
export const DRAFTS_PER_RUN = 3;

export type JobPhoto = { url: string; alt: string };
export type JobPostDraft = {
  project_id: string;
  title: string;
  slug: string;
  body: string;
  google_post: string;
  town: string | null;
  service: string | null;
  photos: JobPhoto[];
};

export type CompletedJob = { id: string; completed_at: string | null; photo_count: number };

/** Finished jobs worth a post: done in the last 60 days, with photos, not already drafted. Newest first. */
export function jobsDue(jobs: CompletedJob[], drafted: Set<string>, now: number): CompletedJob[] {
  return jobs
    .filter((j) => j.completed_at && j.photo_count > 0 && !drafted.has(j.id) && now - Date.parse(j.completed_at) <= RECENT_DAYS * DAY)
    .sort((a, b) => Date.parse(b.completed_at!) - Date.parse(a.completed_at!))
    .slice(0, DRAFTS_PER_RUN);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** A draft from the panel, checked and trimmed - or what's wrong with it. */
export function parseDraft(input: unknown, photoHost: string): JobPostDraft | { error: string } {
  const d = (input ?? {}) as Record<string, unknown>;
  const project_id = str(d.project_id, 40);
  if (!/^[0-9a-f-]{36}$/i.test(project_id)) return { error: "project_id must be a uuid" };
  const title = str(d.title, 120);
  const body = str(d.body, 6000);
  if (!title || !body) return { error: "title and body are required" };
  const slug = slugify(str(d.slug, 120) || title);
  if (!slug) return { error: "slug is empty" };
  const photos = (Array.isArray(d.photos) ? d.photos : [])
    .slice(0, 8)
    .map((p) => ({ url: str((p as JobPhoto)?.url, 500), alt: str((p as JobPhoto)?.alt, 200) }))
    // Only the dashboard's own photo storage - a draft can't point a client's site at someone else's images.
    .filter((p) => p.url.startsWith(photoHost));
  return {
    project_id,
    title,
    slug,
    body,
    google_post: str(d.google_post, 1500),
    town: str(d.town, 80) || null,
    service: str(d.service, 80) || null,
    photos,
  };
}

/** The client's heads-up that a post is waiting. */
export function draftReadyEmail(businessName: string, title: string, postsUrl: string) {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  return {
    subject: `Ready to approve: "${title}"`,
    html: `<p>Hi ${esc(businessName)},</p>
      <p>One of your finished jobs has been written up as a page for your website and a post for your Google profile:</p>
      <p><strong>${esc(title)}</strong></p>
      <p>Have a quick read, change anything that's not right, and approve it - it goes on your website the next morning.</p>
      <p><a href="${esc(postsUrl)}">Read and approve it</a></p>
      <p>Scalar Digital</p>`,
  };
}

export const REMIND_AFTER_DAYS = 3;

/** A draft that's waited 3 days and hasn't been reminded about (migration 066). */
export function dueForReminder(post: { status: string; created_at: string; reminded_at: string | null }, now: number): boolean {
  return post.status === "draft" && !post.reminded_at && now - Date.parse(post.created_at) >= REMIND_AFTER_DAYS * DAY;
}

/** The one reminder about drafts still waiting - several drafts make one email. */
export function draftReminderEmail(businessName: string, titles: string[], postsUrl: string) {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  const n = titles.length;
  return {
    subject: n === 1 ? `Still waiting: "${titles[0]}"` : `${n} website posts waiting for you`,
    html: `<p>Hi ${esc(businessName)},</p>
      <p>${n === 1 ? "This write-up of a finished job is" : "These write-ups of finished jobs are"} still waiting for your OK:</p>
      <ul>${titles.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
      <p>Each one approved is another page about your real local work - it takes a minute.</p>
      <p><a href="${esc(postsUrl)}">Read and approve</a></p>
      <p>Scalar Digital</p>`,
  };
}

export async function sendJobPostReminders(): Promise<{ sent: number }> {
  const admin = createAdminClient();
  const { data: drafts, error } = await admin
    .from("job_posts")
    .select("id, tenant_id, title, status, created_at, reminded_at")
    .eq("status", "draft")
    .is("reminded_at", null);
  if (error || !drafts?.length) return { sent: 0 };
  const now = Date.now();
  const byTenant = new Map<string, typeof drafts>();
  for (const d of drafts.filter((d) => dueForReminder(d, now))) byTenant.set(d.tenant_id, [...(byTenant.get(d.tenant_id) ?? []), d]);
  let sent = 0;
  for (const [tenantId, posts] of byTenant) {
    try {
      const { data: t } = await admin.from("tenants").select("business_name, contact_email, domain, slug").eq("id", tenantId).maybeSingle();
      // Marked first, so a failed send never turns into a reminder every day.
      await admin.from("job_posts").update({ reminded_at: new Date().toISOString() }).in("id", posts.map((p) => p.id));
      if (!t?.contact_email) continue;
      await sendEmail({ to: [t.contact_email], ...draftReminderEmail(t.business_name, posts.map((p) => p.title), `${tenantOrigin(t)}/posts`) });
      sent++;
    } catch (err) {
      console.error(`Job post reminder failed for tenant ${tenantId}:`, err);
      Sentry.captureException(err);
    }
  }
  return { sent };
}

export type GrowthStats = { pagesPublished: number; pagesLive: number; pageVisits: number; pageTaps: number; waiting: number };

/** Pageviews (track.js) on job pages: visits, and call / WhatsApp taps made from them. */
export function jobPageCounts(rows: { path: string | null; kind: string | null }[]): { visits: number; taps: number } {
  const onJobs = rows.filter((r) => (r.path ?? "").startsWith("/work/"));
  return {
    visits: onJobs.filter((r) => !r.kind).length,
    taps: onJobs.filter((r) => r.kind === "call" || r.kind === "whatsapp").length,
  };
}

/** How many jobs finished in [from, to) had photos - the raw material Growth turns into pages. */
export async function finishedJobsWithPhotos(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
  fromIso: string,
  toIso: string
): Promise<number> {
  const { data: projects } = await admin
    .from("projects")
    .select("id")
    .eq("tenant_id", tenantId)
    .gte("completed_at", fromIso)
    .lt("completed_at", toIso);
  const ids = (projects ?? []).map((p) => p.id);
  if (!ids.length) return 0;
  const { data: photos } = await admin.from("project_photos").select("project_id").in("project_id", ids);
  return new Set((photos ?? []).map((p) => p.project_id)).size;
}

/** Care clients' monthly report: their own finished jobs, as the case for Growth. Empty when there's nothing to point at. */
export function growthPitch(jobsWithPhotos: number): string {
  if (jobsWithPhotos < 1) return "";
  const n = jobsWithPhotos === 1 ? "1 job" : `${jobsWithPhotos} jobs`;
  return `<p style="margin:18px 0 6px;padding:12px 14px;background:#f4f1ea;border-radius:8px;color:#17140f;">
      You finished ${n} with photos last month. On the <strong>Growth plan</strong>, each one becomes its own page on your website
      and a post for your Google profile - written for you, live once you OK it. More pages about real local jobs is what moves you
      up the search results. Reply to this email if you'd like it switched on.</p>`;
}

/** Per client, finished jobs with photos in the last 60 days - /admin's Growth candidates. */
export async function recentJobsWithPhotosByTenant(admin: ReturnType<typeof createAdminClient>, now = Date.now()): Promise<Map<string, number>> {
  const since = new Date(now - RECENT_DAYS * DAY).toISOString();
  const { data: done } = await admin.from("projects").select("id, tenant_id").gte("completed_at", since);
  const out = new Map<string, number>();
  if (!done?.length) return out;
  const { data: photos } = await admin.from("project_photos").select("project_id").in("project_id", done.map((r) => r.id));
  const withPhotos = new Set((photos ?? []).map((p) => p.project_id));
  for (const r of done) if (withPhotos.has(r.id)) out.set(r.tenant_id, (out.get(r.tenant_id) ?? 0) + 1);
  return out;
}
