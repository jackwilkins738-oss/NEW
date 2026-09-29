"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/membershipRole";

// This device's phone-notification subscription (migration 054). RLS only
// lets a user write rows for themselves, in a business they belong to.
export async function savePushSubscription(
  tenantId: string,
  sub: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }
): Promise<{ ok: boolean; error?: string }> {
  const endpoint = typeof sub?.endpoint === "string" ? sub.endpoint : "";
  const p256dh = typeof sub?.keys?.p256dh === "string" ? sub.keys.p256dh : "";
  const auth = typeof sub?.keys?.auth === "string" ? sub.keys.auth : "";
  if (!endpoint.startsWith("https://") || endpoint.length > 1000 || !p256dh || p256dh.length > 200 || !auth || auth.length > 100) {
    return { ok: false, error: "This browser gave an unusable subscription." };
  }
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user || !(await getCurrentUserRole(supabase, tenantId, userData.user.id))) return { ok: false, error: "Not allowed." };
  // One row per device: replace whatever this endpoint had before.
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  const { error } = await supabase.from("push_subscriptions").insert({ user_id: userData.user.id, tenant_id: tenantId, endpoint, p256dh, auth });
  return error ? { ok: false, error: "Couldn't save - try again." } : { ok: true };
}

export async function removePushSubscription(endpoint: string) {
  const supabase = await createClient();
  await supabase.from("push_subscriptions").delete().eq("endpoint", String(endpoint).slice(0, 1000));
}
