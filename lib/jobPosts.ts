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
