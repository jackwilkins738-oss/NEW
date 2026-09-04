"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (email) {
    const supabase = createClient();
    const host = headers().get("host");
    // Errors are deliberately swallowed and the redirect below always fires
    // the same way, whether or not the email matched an account - otherwise
    // this page could be used to check which emails have logins.
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `https://${host}/reset-password`,
    });
  }

  redirect("/forgot-password?sent=1");
}
