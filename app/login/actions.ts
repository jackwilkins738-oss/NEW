"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/platformAdmin";

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const tenantId = String(formData.get("tenantId") ?? "");
  const supabase = createClient();

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    redirect(`/login?error=${encodeURIComponent("Incorrect email or password.")}`);
  }

  // Signing in only proves who they are - it doesn't prove they belong to
  // *this* tenant's dashboard. Reject and sign back out if there's no
  // membership linking them to the business this domain belongs to.
  const membership = await supabase
    .from("memberships")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("user_id", data.user!.id)
    .maybeSingle();

  if (!membership.data) {
    await supabase.auth.signOut();
    redirect(`/login?error=${encodeURIComponent("That account isn't linked to this business.")}`);
  }

  redirect("/dashboard");
}

// For domains with no matching tenant (the admin domain, by design - it's
// not meant to belong to any customer). Proves who they are, then checks
// platform_admins instead of memberships, since there's no tenant here to
// check membership against.
export async function adminSignIn(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const supabase = createClient();

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    redirect(`/login?error=${encodeURIComponent("Incorrect email or password.")}`);
  }

  if (!(await isPlatformAdmin(data.user!.id))) {
    await supabase.auth.signOut();
    redirect(
      `/login?error=${encodeURIComponent("This isn't a customer dashboard - go to your business's own dashboard URL to sign in.")}`
    );
  }

  redirect("/admin");
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
