"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
