"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/membershipRole";
import { notifyChangeRequest } from "@/lib/changeRequests";

// A client asking Scalar Digital for a change to their website (migration
// 051). RLS lets a member add one for their own business only; the email to
// the platform admins is the part that makes sure it's seen.
export async function submitChangeRequest(
  tenantId: string,
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const message = String(formData.get("message") ?? "").trim().slice(0, 4000);
  if (message.length < 5) return { ok: false, error: "Say what you'd like changed." };
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user || !(await getCurrentUserRole(supabase, tenantId, userData.user.id))) return { ok: false, error: "Not allowed." };

  const { error } = await supabase.from("change_requests").insert({ tenant_id: tenantId, created_by: userData.user.id, message });
  if (error) return { ok: false, error: "Couldn't send that just now - please try again, or email hello@scalardigital.co.uk." };

  const from = userData.user.email ?? "";
  after(() => notifyChangeRequest(createAdminClient(), tenantId, message, from));
  revalidatePath("/help");
  return { ok: true };
}
