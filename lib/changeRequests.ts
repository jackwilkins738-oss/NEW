import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/jobs";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

// Emails the platform admins about a new change request - from the Website
// help page, or pinned on a draft site with the feedback button. The email is
// what makes sure it's seen; /admin lists them all.
export async function notifyChangeRequest(admin: Admin, tenantId: string, message: string, replyTo?: string): Promise<void> {
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
        <p><a href="https://admin.scalardigital.co.uk/admin">Open /admin</a>${replyTo ? " - reply to this email to answer them." : "."}</p>
      </div>`,
    replyTo: replyTo || undefined,
  });
}

const clean = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** A pin from the draft-site feedback button, as one change-request message. Null when there's nothing to say. */
export function feedbackMessage(body: Record<string, unknown>): string | null {
  const comment = String(body.comment ?? "").trim().slice(0, 2000);
  if (comment.length < 2) return null;
  const page = clean(body.page, 200).replace(/[^\w/.\-]/g, "") || "/";
  const near = clean(body.near, 120);
  const x = Math.round(Math.min(100, Math.max(0, Number(body.x) || 0)));
  const y = Math.round(Math.min(100, Math.max(0, Number(body.y) || 0)));
  const who = clean(body.name, 80);
  return `[Draft site feedback] ${page}${near ? ` - near "${near}"` : ""} (${x}% across, ${y}% down)${who ? ` - from ${who}` : ""}\n${comment}`;
}
