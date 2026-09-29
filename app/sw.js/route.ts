import { NextResponse } from "next/server";

// The service worker for phone notifications (lib/push.ts), served at /sw.js
// so its scope is the whole dashboard. It only shows notifications and opens
// the right page when one is tapped - no caching, nothing else.
export async function GET() {
  const body = `
self.addEventListener('push', function (event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  event.waitUntil(self.registration.showNotification(data.title || 'Dashboard', {
    body: data.body || '',
    icon: '/icon',
    badge: '/icon',
    data: { url: data.url || '/dashboard' }
  }));
});
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || '/dashboard';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if ('focus' in list[i]) { list[i].navigate(url); return list[i].focus(); }
    }
    return self.clients.openWindow(url);
  }));
});
`.trim();
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache",
      "Service-Worker-Allowed": "/",
    },
  });
}
