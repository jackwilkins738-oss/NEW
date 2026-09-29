import { NextResponse } from "next/server";

// Served at /track.js. Embed on a customer's website as:
//   <script src="https://dashboard.example.com/track.js"
//           data-tenant="<tenant id>" data-site-key="<tenant site_key>" defer></script>
// It logs a pageview on every load, and a lead on submit of any <form data-lead-form>
// with name="name"/"email"/"phone"/"message"/"source" fields - plus up to five
// photos from an <input type="file" name="photos" multiple accept="image/*">.
//
// The Supabase URL and anon key are baked in server-side here (from this app's own
// env vars) so the snippet pasted into a customer's site only ever needs their
// tenant id and site_key - nothing that identifies this app's own credentials
// needs to be hand-copied per customer.
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  const body = `
(function () {
  var s = document.currentScript;
  var tenantId = s.getAttribute('data-tenant');
  var siteKey = s.getAttribute('data-site-key');
  var SUPABASE_URL = ${JSON.stringify(url)};
  var ANON_KEY = ${JSON.stringify(anonKey)};
  // Derived from the script's own src, not hardcoded, so this keeps working
  // if this app's own domain ever changes.
  var API_HOST = (function () {
    try { return new URL(s.src, location.href).origin; } catch (e) { return ''; }
  })();
  if (!tenantId || !siteKey) {
    console.warn('[dashboard] track.js is missing data-tenant or data-site-key');
    return;
  }

  // Pageviews go straight to Supabase - high volume, nothing needs to react
  // to one, no reason to add a hop.
  fetch(SUPABASE_URL + '/rest/v1/pageviews', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON_KEY,
      Authorization: 'Bearer ' + ANON_KEY,
      Prefer: 'return=minimal'
    },
    body: JSON.stringify({ tenant_id: tenantId, site_key: siteKey, path: location.pathname, referrer: document.referrer || null }),
    keepalive: true
  }).catch(function () {});

  // Leads go through this app's own API instead of straight to Supabase,
  // so a notification email can fire the moment one comes in.
  //
  // Photos: a form with <input type="file" name="photos" multiple accept="image/*">
  // sends up to 5 pictures of the job with the enquiry. Those forms wait for
  // the uploads (each goes straight to private storage through a one-time
  // link), then show a thank-you in place of the form - or go to the page in
  // data-lead-redirect="/thanks" - and fire a "lead-sent" event on the form.
  // If the photos fail, the enquiry is still sent without them.
  var PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
  document.addEventListener(
    'submit',
    function (e) {
      var form = e.target;
      if (!form || typeof form.matches !== 'function' || !form.matches('[data-lead-form]')) return;
      var data = new FormData(form);
      function sendLead(photos, keepalive) {
        return fetch(API_HOST + '/api/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenant_id: tenantId,
            site_key: siteKey,
            name: data.get('name') || null,
            email: data.get('email') || null,
            phone: data.get('phone') || null,
            message: data.get('message') || null,
            source: data.get('source') || null,
            photos: photos
          }),
          keepalive: keepalive
        });
      }
      var input = form.querySelector('input[type="file"][name="photos"]');
      var files = [];
      if (input && input.files) {
        for (var i = 0; i < input.files.length && files.length < 5; i++) {
          var f = input.files[i];
          if (PHOTO_TYPES.indexOf(f.type) !== -1 && f.size > 0 && f.size <= 10 * 1024 * 1024) files.push(f);
        }
      }
      if (!files.length) {
        sendLead([], true).catch(function () {});
        return;
      }
      e.preventDefault();
      var button = form.querySelector('[type="submit"]');
      if (button) { button.disabled = true; button.textContent = 'Sending...'; }
      fetch(API_HOST + '/api/leads/uploads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          site_key: siteKey,
          files: files.map(function (f) { return { type: f.type, size: f.size }; })
        })
      })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (!res || !res.uploads) return [];
          return Promise.all(res.uploads.map(function (u, n) {
            return fetch(u.url, { method: 'PUT', headers: { 'Content-Type': files[n].type }, body: files[n] })
              .then(function (r) { return r.ok ? u.path : null; }, function () { return null; });
          }));
        })
        .catch(function () { return []; })
        .then(function (paths) { return sendLead(paths.filter(Boolean), false); })
        .then(function (r) {
          if (!r.ok) throw new Error('not sent');
          try { form.dispatchEvent(new CustomEvent('lead-sent', { bubbles: true })); } catch (err) {}
          var next = form.getAttribute('data-lead-redirect');
          if (next) { location.href = next; return; }
          var thanks = document.createElement('p');
          thanks.setAttribute('role', 'status');
          thanks.textContent = 'Thanks - your enquiry and photos have been sent. We will be in touch shortly.';
          form.replaceWith(thanks);
        })
        .catch(function () {
          if (button) { button.disabled = false; button.textContent = 'Try again'; }
          alert('Sorry - that did not send. Please try again, or give us a call.');
        });
    },
    true
  );
})();
`.trim();

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
