"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/tenant";

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  // getCurrentTenant() looks the Host header up against known tenant
  // domains/slugs rather than trusting it outright - using the raw header
  // here instead (as this used to) would let a forged Host make Supabase
  // mail out a reset link pointing at an attacker's domain, leaking the
  // reset token the moment the victim clicked it.
  const tenant = await getCurrentTenant();

  if (email && tenant) {
    const supabase = await createClient();
    const host = tenant.domain || `${tenant.slug}.scalardigital.co.uk`;
    // Errors are deliberately swallowed and the redirect below always fires
    // the same way, whether or not the email matched an account - otherwise
    // this page could be used to check which emails have logins.
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `https://${host}/reset-password`,
    });
  }

  redirect("/forgot-password?sent=1");
}
