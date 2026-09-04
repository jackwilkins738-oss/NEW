"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformAdmin } from "@/lib/platformAdmin";

async function requireAdmin() {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user || !(await isPlatformAdmin(data.user.id))) {
    throw new Error("Not authorised");
  }
  return { supabase, userId: data.user.id };
}

export async function createTenant(formData: FormData) {
  const { supabase } = await requireAdmin();

  const businessName = String(formData.get("businessName") ?? "").trim();
  const slug = String(formData.get("slug") ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-");
  const domain = String(formData.get("domain") ?? "").trim() || null;

  if (!businessName || !slug) {
    return { error: "Business name and slug are required." };
  }

  const { data, error } = await supabase
    .from("tenants")
    .insert({ business_name: businessName, slug, domain })
    .select("id, business_name, slug, domain, site_key")
    .single();

  if (error) {
    return { error: error.message.includes("duplicate") ? "That slug or domain is already taken." : error.message };
  }

  revalidatePath("/admin");
  return { tenant: data };
}

// Uses generateLink rather than sending an email through Supabase (which
// needs SMTP configured) - it returns a real one-time sign-up/sign-in link
// that you copy and send to the customer yourself, however you like
// (email, text, WhatsApp).
export async function inviteTeammate(formData: FormData) {
  const { supabase } = await requireAdmin();
  const adminClient = createAdminClient();

  const tenantId = String(formData.get("tenantId") ?? "");
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!tenantId || !email) return { error: "Pick a business and enter an email." };

  const { data: tenant } = await supabase.from("tenants").select("domain, slug").eq("id", tenantId).single();
  const host = tenant?.domain || headers().get("host") || "";
  const redirectTo = `https://${host}/dashboard`;

  let link: string | null = null;
  let userId: string | null = null;

  const invite = await adminClient.auth.admin.generateLink({ type: "invite", email, options: { redirectTo } });
  if (invite.data?.properties?.action_link) {
    link = invite.data.properties.action_link;
    userId = invite.data.user?.id ?? null;
  } else {
    // Most likely cause: this email already has an account (e.g. inviting
    // the same person into a second business) - a magic link works for an
    // existing user the same way an invite link does for a new one.
    const magic = await adminClient.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo } });
    if (!magic.data?.properties?.action_link) {
      return { error: magic.error?.message ?? invite.error?.message ?? "Could not generate a sign-in link." };
    }
    link = magic.data.properties.action_link;
    userId = magic.data.user?.id ?? null;
  }

  if (!userId) return { error: "Link generated but no user id was returned - try again." };

  const { error: membershipError } = await supabase
    .from("memberships")
    .upsert({ tenant_id: tenantId, user_id: userId }, { onConflict: "tenant_id,user_id" });

  if (membershipError) return { error: membershipError.message };

  revalidatePath("/admin");
  return { link, email };
}
