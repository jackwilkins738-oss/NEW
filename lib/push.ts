import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

// Phone notifications (migration 054), for the two moments that matter most:
// a new enquiry and a quote accepted. An email can sit unread in the van; a
// notification is on the lock screen. Needs NEXT_PUBLIC_VAPID_PUBLIC_KEY and
// VAPID_PRIVATE_KEY (npx web-push generate-vapid-keys) - without them this
// does nothing. On iPhone, notifications work once the dashboard is added to
// the Home Screen (Share > Add to Home Screen) - Apple's rule, not ours.

export type PushMessage = { title: string; body: string; url: string };

export function pushConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/** The notification's text, trimmed to what a lock screen shows. */
export function pushPayload(m: PushMessage): string {
  return JSON.stringify({ title: m.title.slice(0, 80), body: m.body.replace(/\s+/g, " ").trim().slice(0, 160), url: m.url });
}

/** Sends to every device of every member of the business. Never throws. */
export async function sendPush(admin: SupabaseClient, tenantId: string, message: PushMessage): Promise<number> {
  if (!pushConfigured()) return 0;
  const { data: subs, error } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("tenant_id", tenantId);
  if (error || !subs?.length) return 0;
  webpush.setVapidDetails("mailto:hello@scalardigital.co.uk", process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  const payload = pushPayload(message);
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 });
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await admin.from("push_subscriptions").delete().eq("id", s.id);
        else console.error("Push failed:", status ?? err);
      }
    })
  );
  return sent;
}
