import { NextResponse } from "next/server";

// Served at /testimonials.js. Embed on a tenant's site as:
//   <script src="https://dashboard.example.com/testimonials.js" data-tenant="<tenant id>" defer></script>
//
// Renders that tenant's published, received reviews (see ReviewsPanel on
// the project detail page) into <div id="testimonials-list">, then
// un-hides its parent [data-testimonials] section. Same shape as
// gallery.js - does nothing if there's nothing to show yet, safe to leave
// on every site.
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
    SUPABASE_URL + '/rest/v1/reviews?tenant_id=eq.' + encodeURIComponent(tenantId) +
      '&published=eq.true&status=eq.received&select=customer_name,rating,review_text,received_at&order=received_at.desc&limit=12',
    { headers: { apikey: ANON_KEY, Authorization: 'Bearer ' + ANON_KEY } }
  )
    .then(function (res) { return res.ok ? res.json() : []; })
    .then(function (reviews) {
      if (!reviews || !reviews.length) return;
      var list = document.getElementById('testimonials-list');
      if (!list) return;
      reviews.forEach(function (r) {
        var item = document.createElement('div');
        item.className = 'testimonial';
        if (r.rating) {
          var stars = document.createElement('div');
          stars.className = 'testimonial__stars';
          stars.textContent = '\\u2605'.repeat(r.rating) + '\\u2606'.repeat(5 - r.rating);
          item.appendChild(stars);
        }
        if (r.review_text) {
          var text = document.createElement('p');
          text.className = 'testimonial__text';
          text.textContent = '\\u201C' + r.review_text + '\\u201D';
          item.appendChild(text);
        }
        var name = document.createElement('div');
        name.className = 'testimonial__name';
        name.textContent = r.customer_name;
        item.appendChild(name);
        list.appendChild(item);
      });
      var section = list.closest('[data-testimonials]');
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
