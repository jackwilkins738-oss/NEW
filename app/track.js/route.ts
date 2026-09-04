import { NextResponse } from "next/server";

// Served at /track.js. Embed on a customer's website as:
//   <script src="https://dashboard.example.com/track.js"
//           data-tenant="<tenant id>" data-site-key="<tenant site_key>" defer></script>
// It logs a pageview on every load, and a lead on submit of any <form data-lead-form>
// with name="name"/"email"/"phone"/"message"/"source" fields.
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
  document.addEventListener(
    'submit',
    function (e) {
      var form = e.target;
      if (!form || typeof form.matches !== 'function' || !form.matches('[data-lead-form]')) return;
      var data = new FormData(form);
      fetch(API_HOST + '/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          site_key: siteKey,
          name: data.get('name') || null,
          email: data.get('email') || null,
          phone: data.get('phone') || null,
          message: data.get('message') || null,
          source: data.get('source') || null
        }),
        keepalive: true
      }).catch(function () {});
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
