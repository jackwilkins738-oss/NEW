"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformAdmin } from "@/lib/platformAdmin";
import { PALETTE, DEFAULT_BRAND_THEME } from "@/lib/theme";

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
  const brandThemeInput = String(formData.get("brandTheme") ?? "");
  const brandTheme = PALETTE[brandThemeInput] ? brandThemeInput : DEFAULT_BRAND_THEME;

  if (!businessName || !slug) {
    return { error: "Business name and slug are required." };
  }

  const { data, error } = await supabase
    .from("tenants")
    .insert({ business_name: businessName, slug, domain, brand_theme: brandTheme })
    .select("id, business_name, slug, domain, site_key, brand_theme, created_at")
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
  // NOT headers().get("host") as a fallback - that's wherever /admin itself
  // is being viewed from (always admin.scalardigital.co.uk), never the
  // tenant's own address. Every tenant is reachable at slug.scalardigital.co.uk
  // via the wildcard now, even before a real domain is set, so that's the
  // correct fallback rather than this app's own admin domain.
  const host = tenant?.domain || `${tenant?.slug}.scalardigital.co.uk`;
  // /reset-password, not /dashboard: neither invite nor magiclink links
  // have any built-in "set a password" step from Supabase itself - that's
  // /reset-password's whole job. Landing straight on /dashboard would sign
  // them in with a password they never chose (or, for magiclink, no
  // password-setting step at all).
  const redirectTo = `https://${host}/reset-password`;

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

  if (!link || !userId) return { error: "Link generated but no user id was returned - try again." };

  // Plain insert, not upsert: an upsert needs both an INSERT and an UPDATE
  // RLS policy (Postgres evaluates the ON CONFLICT DO UPDATE branch even
  // when there's no actual conflict), and there's deliberately no UPDATE
  // policy on memberships. A duplicate here just means they're already
  // linked to this business, which is fine - not a real error.
  const { error: membershipError } = await supabase.from("memberships").insert({ tenant_id: tenantId, user_id: userId });

  if (membershipError && membershipError.code !== "23505") {
    return { error: membershipError.message };
  }

  revalidatePath("/admin");
  return { link, email };
}

export async function updateTenantDomain(formData: FormData) {
  const { supabase } = await requireAdmin();

  const tenantId = String(formData.get("tenantId") ?? "");
  const domain = String(formData.get("domain") ?? "").trim() || null;
  if (!tenantId) return { error: "Missing tenant." };

  const { data, error } = await supabase
    .from("tenants")
    .update({ domain })
    .eq("id", tenantId)
    .select("id, business_name, slug, domain, site_key, brand_theme, created_at")
    .single();

  if (error) {
    return { error: error.message.includes("duplicate") ? "That domain is already in use." : error.message };
  }

  revalidatePath("/admin");
  return { tenant: data };
}

export async function updateTenantBrandTheme(formData: FormData) {
  const { supabase } = await requireAdmin();

  const tenantId = String(formData.get("tenantId") ?? "");
  const brandThemeInput = String(formData.get("brandTheme") ?? "");
  if (!tenantId || !PALETTE[brandThemeInput]) return { error: "Invalid selection." };

  const { data, error } = await supabase
    .from("tenants")
    .update({ brand_theme: brandThemeInput })
    .eq("id", tenantId)
    .select("id, business_name, slug, domain, site_key, brand_theme, created_at")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { tenant: data };
}

// Removes their access to this one business - not their account. Service
// role, same reasoning as the page's listing query: there's no RLS delete
// policy on memberships for platform admins (deliberately - only members
// can be linked/unlinked, and only through this gated action), so this
// bypasses RLS and requireAdmin() above is what's actually authorizing it.
export async function removeMembership(membershipId: string) {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("memberships").delete().eq("id", membershipId);
  if (error) return { error: error.message };
  revalidatePath("/admin");
  return { success: true };
}
