"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/membershipRole";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/jobs";

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
  after(async () => {
    const admin = createAdminClient();
    const { data: tenant } = await admin.from("tenants").select("business_name").eq("id", tenantId).maybeSingle();
    const { data: admins } = await admin.from("platform_admins").select("user_id");
    const to: string[] = [];
    for (const a of admins ?? []) {
      const { data } = await admin.auth.admin.getUserById(a.user_id);
      if (data.user?.email) to.push(data.user.email);
    }
    if (to.length === 0) return;
    await sendEmail({
      to,
      subject: `Change request: ${tenant?.business_name ?? "a customer"}`,
      html: `<div style="font-family:Helvetica,Arial,sans-serif;color:#17140f;">
        <p><strong>${escapeHtml(tenant?.business_name ?? "A customer")}</strong> asked for a change to their website:</p>
        <p style="white-space:pre-line;border-left:3px solid #17140f;padding-left:12px;">${escapeHtml(message)}</p>
        <p><a href="https://admin.scalardigital.co.uk/admin">Open /admin</a> - reply to this email to answer them.</p>
      </div>`,
      replyTo: from || undefined,
    });
  });
  revalidatePath("/help");
  return { ok: true };
}
