"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformAdmin } from "@/lib/platformAdmin";
import { PALETTE, DEFAULT_BRAND_THEME } from "@/lib/theme";
import { logAudit } from "@/lib/auditLog";
import { resetDemo } from "@/lib/demo";
import { tenantOrigin } from "@/lib/tenantOrigin";
import { billingStart, DASHBOARD_MONTHLY_PENCE } from "@/lib/billing";
import { createSubscriptionCheckout } from "@/lib/stripe";
import { ensureRedirectUrl, redirectUrlFor } from "@/lib/supabaseRedirects";

async function requireAdmin() {
  const supabase = await createClient();
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

  const redirect = await ensureRedirectUrl(redirectUrlFor(data));
  revalidatePath("/admin");
  return { tenant: data, redirect };
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
  const roleInput = String(formData.get("role") ?? "owner");
  const role = roleInput === "member" ? "member" : "owner";
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
  const redirectTo = `https://${host}/auth/confirm`;

  let link: string | null = null;
  let userId: string | null = null;

  // Built from hashed_token + type, pointed at our own /auth/confirm route,
  // rather than using generateLink()'s own action_link - see the comment on
  // that route for why (action_link's hash-fragment tokens are unreliable
  // with this app's Supabase client).
  function confirmLink(props: { hashed_token?: string; verification_type?: string } | null | undefined) {
    if (!props?.hashed_token) return null;
    return `https://${host}/auth/confirm?token_hash=${props.hashed_token}&type=${props.verification_type}&next=${encodeURIComponent("/reset-password")}`;
  }

  const invite = await adminClient.auth.admin.generateLink({ type: "invite", email, options: { redirectTo } });
  link = confirmLink(invite.data?.properties);
  if (link) {
    userId = invite.data?.user?.id ?? null;
  } else {
    // Most likely cause: this email already has an account (e.g. inviting
    // the same person into a second business) - a magic link works for an
    // existing user the same way an invite link does for a new one.
    const magic = await adminClient.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo } });
    link = confirmLink(magic.data?.properties);
    if (!link) {
      return { error: magic.error?.message ?? invite.error?.message ?? "Could not generate a sign-in link." };
    }
    userId = magic.data?.user?.id ?? null;
  }

  if (!link || !userId) return { error: "Link generated but no user id was returned - try again." };

  // Plain insert, not upsert: an upsert needs both an INSERT and an UPDATE
  // RLS policy (Postgres evaluates the ON CONFLICT DO UPDATE branch even
  // when there's no actual conflict), and there's deliberately no UPDATE
  // policy on memberships. A duplicate here just means they're already
  // linked to this business, which is fine - not a real error.
  const { error: membershipError } = await supabase.from("memberships").insert({ tenant_id: tenantId, user_id: userId, role });

  if (membershipError && membershipError.code !== "23505") {
    return { error: membershipError.message };
  }

  revalidatePath("/admin");
  return { link, email };
}

// Admin client, not the session-scoped one: memberships deliberately has
// no UPDATE RLS policy (see the insert above), so requireAdmin() is the
// real authorisation gate here, same pattern as removeMembership/
// deleteTenant already use for the operations RLS doesn't cover.
export async function updateMembershipRole(membershipId: string, role: "owner" | "member") {
  const { userId: adminUserId } = await requireAdmin();
  const admin = createAdminClient();
  const { data: membership } = await admin.from("memberships").select("tenant_id, user_id").eq("id", membershipId).maybeSingle();
  const { error } = await admin.from("memberships").update({ role }).eq("id", membershipId);
  if (error) return { error: error.message };
  revalidatePath("/admin");
  if (membership) {
    const { data: userData } = await admin.auth.admin.getUserById(membership.user_id);
    await logAudit({
      tenantId: membership.tenant_id,
      userId: adminUserId,
      action: "membership.role_changed",
      entityType: "membership",
      entityId: membershipId,
      summary: `Changed ${userData.user?.email ?? "a user"}'s access to ${role}`,
    });
  }
  return { ok: true as const };
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

  const redirect = await ensureRedirectUrl(redirectUrlFor(data));
  revalidatePath("/admin");
  return { tenant: data, redirect };
}

// Aftercare dates (migration 041). These columns aren't in the anon/
// authenticated column grant, so the write goes through the service-role
// client - requireAdmin() is the authorization, same as removeMembership.
// Where a business's enquiry alerts go (as well as to anyone with a login) -
// for a landing-page client with no dashboard login, it's the only place.
// contact_email isn't in the session client's column grant (migration 039),
// so this writes with the service role after the platform-admin check.
export async function updateTenantContactEmailAdmin(formData: FormData) {
  await requireAdmin();
  const tenantId = String(formData.get("tenantId") ?? "");
  const email = String(formData.get("contactEmail") ?? "").trim().toLowerCase() || null;
  if (!tenantId) return { error: "Missing tenant." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "That doesn't look like an email address." };
  const { error } = await createAdminClient().from("tenants").update({ contact_email: email }).eq("id", tenantId);
  if (error) return { error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

export async function updateTenantAftercare(formData: FormData) {
  await requireAdmin();

  const tenantId = String(formData.get("tenantId") ?? "");
  const launchedOnInput = String(formData.get("launchedOn") ?? "").trim();
  const months = Number(formData.get("freeHostingMonths"));
  if (!tenantId) return { error: "Missing tenant." };
  if (launchedOnInput && !/^\d{4}-\d{2}-\d{2}$/.test(launchedOnInput)) return { error: "Invalid date." };
  if (!Number.isInteger(months) || months < 0 || months > 60) return { error: "Invalid hosting length." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("tenants")
    .update({ launched_on: launchedOnInput || null, free_hosting_months: months })
    .eq("id", tenantId);
  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { ok: true as const };
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
  const { userId: adminUserId } = await requireAdmin();
  const admin = createAdminClient();
  const { data: membership } = await admin.from("memberships").select("tenant_id, user_id").eq("id", membershipId).maybeSingle();
  const { error } = await admin.from("memberships").delete().eq("id", membershipId);
  if (error) return { error: error.message };
  revalidatePath("/admin");
  if (membership) {
    const { data: userData } = await admin.auth.admin.getUserById(membership.user_id);
    await logAudit({
      tenantId: membership.tenant_id,
      userId: adminUserId,
      action: "membership.removed",
      entityType: "membership",
      entityId: membershipId,
      summary: `Removed ${userData.user?.email ?? "a user"}'s access`,
    });
  }
  return { success: true };
}

// Permanently deletes a customer and everything tied to their tenant_id -
// leads, projects, invoices, trade capacity, memberships, pageviews - via
// the "on delete cascade" foreign keys already on every one of those
// tables (see supabase/schema.sql), not application code doing the
// cleanup itself. Same service-role reasoning as removeMembership above:
// no RLS delete policy exists for tenants, so requireAdmin() is the real
// gate here. There is no undo - the confirmation text in AdminPanel.tsx
// is the only safety net.
export async function deleteTenant(tenantId: string) {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("tenants").delete().eq("id", tenantId);
  if (error) return { error: error.message };
  revalidatePath("/admin");
  return { success: true };
}

// Sets up (first time) and refreshes the sales demo (lib/demo.ts): a made-up
// firm's dashboard to screen-share on calls. Also makes sure the admin who
// pressed it can sign in to it.
export async function resetDemoTenant(showAs?: string) {
  const { userId } = await requireAdmin();
  const admin = createAdminClient();
  try {
    const tenantId = await resetDemo(admin, typeof showAs === "string" ? showAs.slice(0, 80) : null);
    await admin
      .from("memberships")
      .upsert({ tenant_id: tenantId, user_id: userId, role: "owner" }, { onConflict: "tenant_id,user_id" });
    const { data: tenant } = await admin.from("tenants").select("domain, slug").eq("id", tenantId).maybeSingle();
    return { ok: true as const, url: `${tenantOrigin(tenant)}/login` };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "Reset failed" };
  }
}

// The £39/month dashboard fee (lib/billing.ts): a Stripe checkout link to send
// the client. The card goes in now; the first charge waits for the end of
// their free period.
export async function createBillingLink(tenantId: string): Promise<{ url: string; startsOn: string } | { error: string }> {
  await requireAdmin();
  if (!process.env.STRIPE_SECRET_KEY) return { error: "Add STRIPE_SECRET_KEY in Vercel first (Scalar's own Stripe account)." };
  const admin = createAdminClient();
  const { data: t } = await admin
    .from("tenants")
    .select("id, business_name, domain, slug, contact_email, launched_on, free_hosting_months")
    .eq("id", tenantId)
    .maybeSingle();
  if (!t) return { error: "Customer not found." };
  const start = billingStart(t.launched_on, t.free_hosting_months ?? 12);
  if ("error" in start) return start;
  try {
    const origin = tenantOrigin(t);
    const session = await createSubscriptionCheckout({
      amountPence: DASHBOARD_MONTHLY_PENCE,
      productName: `Dashboard - ${t.business_name}`,
      customerEmail: t.contact_email,
      trialEnd: start.trialEnd,
      successUrl: `${origin}/help?billing=done`,
      cancelUrl: `${origin}/help`,
      metadata: { billing_tenant_id: t.id },
    });
    return { url: session.url, startsOn: start.startsOn };
  } catch (err) {
    console.error("Billing link failed:", err);
    return { error: "Stripe refused - check STRIPE_SECRET_KEY is Scalar's own live key." };
  }
}

export async function markChangeRequestDone(requestId: string) {
  await requireAdmin();
  await createAdminClient().from("change_requests").update({ status: "done", done_at: new Date().toISOString() }).eq("id", requestId);
  revalidatePath("/admin");
}

// The client's live website, for the hourly uptime check (lib/siteMonitor.ts).
export async function setWebsiteUrl(tenantId: string, url: string): Promise<{ ok: true } | { error: string }> {
  await requireAdmin();
  let clean = url.trim().toLowerCase().replace(/\/+$/, "");
  if (clean && !/^https?:\/\//.test(clean)) clean = `https://${clean}`;
  clean = clean.replace(/^http:\/\//, "https://");
  if (clean && !/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/.test(clean)) return { error: "That doesn't look like a website address." };
  const { error } = await createAdminClient()
    .from("tenants")
    .update({ website_url: clean || null, site_status: null, site_fail_count: 0, site_down_since: null })
    .eq("id", tenantId);
  if (error) return { error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}
