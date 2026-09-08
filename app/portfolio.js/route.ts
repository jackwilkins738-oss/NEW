import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Served at /portfolio.js?tenant=<tenant id>. Embed as:
//   <script src="https://dashboard.example.com/portfolio.js?tenant=<tenant id>" defer></script>
//
// Renders that tenant's completed projects (projects.completed_at set - see
// "Mark complete" on the project detail page) into <div id="portfolio-list">,
// each with its first uploaded photo as a cover image, then un-hides its
// parent [data-portfolio] section.
//
// Deliberately NOT the same shape as gallery.js/testimonials.js: those serve
// one generic script that does its own client-side Supabase fetch, relying
// on a public RLS read policy on project_photos/reviews - both tables only
// ever hold content that's already meant to be public. projects is not that
// table (client_name, value_pence, notes are all commercially sensitive),
// so there's no public RLS policy on it and there shouldn't be one. This
// route does the query server-side instead, with the service-role client,
// and only ever returns the three fields that are actually safe to publish:
// project_type, location, and completed_at - never the client's name or the
// job's value.
export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenant");
  if (!tenantId) {
    return new NextResponse("", { headers: { "Content-Type": "application/javascript; charset=utf-8" } });
  }

  const admin = createAdminClient();
  const { data: projects } = await admin
    .from("projects")
    .select("id, project_type, location, completed_at")
    .eq("tenant_id", tenantId)
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(12);

  const projectIds = (projects ?? []).map((p) => p.id);
  const { data: photos } =
    projectIds.length > 0
      ? await admin
          .from("project_photos")
          .select("project_id, storage_path, caption")
          .in("project_id", projectIds)
          .order("created_at", { ascending: true })
      : { data: [] as { project_id: string; storage_path: string; caption: string | null }[] };

  const coverByProject = new Map<string, { storage_path: string; caption: string | null }>();
  for (const photo of photos ?? []) {
    if (!coverByProject.has(photo.project_id)) coverByProject.set(photo.project_id, photo);
  }

  const items = (projects ?? []).map((p) => ({
    project_type: p.project_type,
    location: p.location,
    completed_at: p.completed_at,
    photo: coverByProject.get(p.id)?.storage_path ?? null,
    caption: coverByProject.get(p.id)?.caption ?? null,
  }));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const body = `
(function () {
  var items = ${JSON.stringify(items)};
  if (!items.length) return;
  var SUPABASE_URL = ${JSON.stringify(supabaseUrl)};
  var list = document.getElementById('portfolio-list');
  if (!list) return;
  items.forEach(function (item) {
    var card = document.createElement('div');
    card.className = 'portfolio__item';
    if (item.photo) {
      var img = document.createElement('img');
      img.src = SUPABASE_URL + '/storage/v1/object/public/project-photos/' + item.photo;
      img.loading = 'lazy';
      img.alt = item.caption || item.project_type || '';
      card.appendChild(img);
    }
    var meta = document.createElement('div');
    meta.className = 'portfolio__meta';
    var title = document.createElement('div');
    title.className = 'portfolio__title';
    title.textContent = item.project_type || 'Completed project';
    meta.appendChild(title);
    if (item.location) {
      var loc = document.createElement('div');
      loc.className = 'portfolio__location';
      loc.textContent = item.location;
      meta.appendChild(loc);
    }
    card.appendChild(meta);
    list.appendChild(card);
  });
  var section = list.closest('[data-portfolio]');
  if (section) section.hidden = false;
})();
`.trim();

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      // Tenant-specific (the query param), not the shared 300s cache
      // gallery.js/testimonials.js use for their one generic script -
      // still fine to cache briefly per-URL.
      "Cache-Control": "public, max-age=120",
    },
  });
}
