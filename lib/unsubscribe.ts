import { createAdminClient } from "@/lib/supabase/admin";

// Campaign unsubscribes (migration 069): by the customer's own token, no sign-in.
const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function unsubscribeCustomer(token: string): Promise<{ business: string } | null> {
  if (!TOKEN.test(token)) return null;
  const admin = createAdminClient();
  const { data: customer } = await admin.from("customers").select("id, tenant_id, unsubscribed_at").eq("unsubscribe_token", token).maybeSingle();
  if (!customer) return null;
  if (!customer.unsubscribed_at) {
    await admin.from("customers").update({ unsubscribed_at: new Date().toISOString() }).eq("id", customer.id);
  }
  const { data: t } = await admin.from("tenants").select("business_name").eq("id", customer.tenant_id).maybeSingle();
  return { business: t?.business_name ?? "this business" };
}

export async function businessForToken(token: string): Promise<{ business: string; already: boolean } | null> {
  if (!TOKEN.test(token)) return null;
  const admin = createAdminClient();
  const { data: customer } = await admin.from("customers").select("tenant_id, unsubscribed_at").eq("unsubscribe_token", token).maybeSingle();
  if (!customer) return null;
  const { data: t } = await admin.from("tenants").select("business_name").eq("id", customer.tenant_id).maybeSingle();
  return { business: t?.business_name ?? "this business", already: !!customer.unsubscribed_at };
}
