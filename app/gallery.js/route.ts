import { NextResponse } from "next/server";

// Served at /gallery.js. Embed on a tenant's site as:
//   <script src="https://dashboard.example.com/gallery.js" data-tenant="<tenant id>" defer></script>
//
// Renders that tenant's "currently on site" photos (uploaded from the
// ProjectPhotosPanel) into <div id="project-gallery">, then un-hides its
// parent [data-project-gallery] section. Does nothing if data-tenant is
// missing/empty or there are no photos yet - safe to leave this tag on
// every site the shared template produces, free tier included, since it
// only ever becomes visible for a paid tenant who has actually uploaded
// something.
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  const body = `
(function () {
  var s = document.currentScript;
  var tenantId = s.getAttribute('data-tenant');
  if (!tenantId) return;
  var SUPABASE_URL = ${JSON.stringify(url)};
  var ANON_KEY = ${JSON.stringify(anonKey)};

  fetch(
    SUPABASE_URL + '/rest/v1/project_photos?tenant_id=eq.' + encodeURIComponent(tenantId) +
      '&select=storage_path,caption,created_at&order=created_at.desc&limit=12',
    { headers: { apikey: ANON_KEY, Authorization: 'Bearer ' + ANON_KEY } }
  )
    .then(function (res) { return res.ok ? res.json() : []; })
    .then(function (photos) {
      if (!photos || !photos.length) return;
      var grid = document.getElementById('project-gallery');
      if (!grid) return;
      photos.forEach(function (p) {
        var item = document.createElement('div');
        item.className = 'gallery__item';
        var img = document.createElement('img');
        img.src = SUPABASE_URL + '/storage/v1/object/public/project-photos/' + p.storage_path;
        img.loading = 'lazy';
        img.alt = p.caption || '';
        item.appendChild(img);
        if (p.caption) {
          var cap = document.createElement('div');
          cap.className = 'gallery__cap';
          cap.textContent = p.caption;
          item.appendChild(cap);
        }
        grid.appendChild(item);
      });
      var section = grid.closest('[data-project-gallery]');
      if (section) section.hidden = false;
    })
    .catch(function () {});
})();
`.trim();

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
