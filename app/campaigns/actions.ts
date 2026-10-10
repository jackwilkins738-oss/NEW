"use server";

import { revalidatePath } from "next/cache";
import { getCurrentTenant } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/membershipRole";
import { planIncludes } from "@/lib/plans";
import { askClaude } from "@/lib/ai";
import { sendEmailBatch } from "@/lib/email";
import { tenantOrigin } from "@/lib/tenantOrigin";
import { logAudit } from "@/lib/auditLog";
import { audience, campaignHtml, campaignPrompt, DRAFTS_PER_DAY, parseCampaign, parseDraft } from "@/lib/campaigns";

// Campaigns (Pro plan, migration 069). Every action checks the signed-in
// member and the plan; sending goes through the server so the audience
// rules (lib/campaigns.ts) can't be skipped.

async function context() {
  const tenant = await getCurrentTenant();
  if (!tenant) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user || !(await getCurrentUserRole(supabase, tenant.id, data.user.id))) return null;
  const admin = createAdminClient();
  const { data: planRow } = await admin.from("tenants").select("plan").eq("id", tenant.id).maybeSingle();
  if (!planIncludes(planRow?.plan, "campaigns")) return null;
  return { tenant, user: data.user, admin };
}

const from = (businessName: string) => `${businessName.replace(/[<>"]/g, "").slice(0, 60)} <notify@scalardigital.help>`;

export async function draftCampaign(idea: string): Promise<{ subject: string; body: string } | { error: string }> {
  const ctx = await context();
  if (!ctx) return { error: "Campaigns are part of the Pro plan." };
  if (idea.trim().length < 4) return { error: "Say what the email is about first." };
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await ctx.admin
    .from("ai_usage")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", ctx.tenant.id)
    .eq("kind", "campaign")
    .gte("created_at", since);
  if ((count ?? 0) >= DRAFTS_PER_DAY) return { error: "That's enough drafts for today - edit the last one, or try tomorrow." };
  try {
    const draft = parseDraft(await askClaude(campaignPrompt(ctx.tenant.business_name, idea), 700));
    await ctx.admin.from("ai_usage").insert({ tenant_id: ctx.tenant.id, kind: "campaign" });
    return draft ?? { error: "That draft didn't come out right - try again, or write it yourself." };
  } catch {
    return { error: "Writing isn't switched on yet - write it yourself below." };
  }
}

export async function audienceCount(): Promise<number | null> {
  const ctx = await context();
  if (!ctx) return null;
  try {
    return (await audience(ctx.admin, ctx.tenant.id)).length;
  } catch {
    return null;
  }
}

export async function sendCampaignTest(input: { subject: string; body: string }): Promise<{ ok: true; to: string } | { error: string }> {
  const ctx = await context();
  if (!ctx) return { error: "Campaigns are part of the Pro plan." };
  const c = parseCampaign(input);
  if ("error" in c) return c;
  if (!ctx.user.email) return { error: "Your login has no email address to send the test to." };
  try {
    await sendEmailBatch([
      {
        to: ctx.user.email,
        from: from(ctx.tenant.business_name),
        subject: `[Test] ${c.subject}`,
        html: campaignHtml(c.body, "Sue Customer", ctx.tenant.business_name, `${tenantOrigin(ctx.tenant)}/unsubscribe/test`),
        replyTo: ctx.tenant.contact_email ?? undefined,
      },
    ]);
    return { ok: true, to: ctx.user.email };
  } catch {
    return { error: "The test didn't send - try again in a minute." };
  }
}

export async function sendCampaign(input: { subject: string; body: string }): Promise<{ ok: true; sent: number } | { error: string }> {
  const ctx = await context();
  if (!ctx) return { error: "Campaigns are part of the Pro plan." };
  const c = parseCampaign(input);
  if ("error" in c) return c;
  let people;
  try {
    people = await audience(ctx.admin, ctx.tenant.id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't work out who to send to." };
  }
  if (!people.length) return { error: "Nobody to send to right now - past customers with an email, not emailed in the last month." };
  const { data: campaign, error } = await ctx.admin
    .from("campaigns")
    .insert({ tenant_id: ctx.tenant.id, subject: c.subject, body: c.body, status: "sending", created_by: ctx.user.id })
    .select("id")
    .single();
  if (error || !campaign) return { error: "Run migration 069 (campaigns) in Supabase first." };
  const origin = tenantOrigin(ctx.tenant);
  let sent = 0;
  // In groups of 100: each group is recorded as sent once Resend has taken it, so a failure part-way
  // through never sends anyone the same campaign twice if it's tried again.
  for (let i = 0; i < people.length; i += 100) {
    const group = people.slice(i, i + 100);
    try {
      await sendEmailBatch(
        group.map((r) => {
          const unsubscribe = `${origin}/unsubscribe/${r.unsubscribe_token}`;
          return {
            to: r.email,
            from: from(ctx.tenant.business_name),
            subject: c.subject,
            html: campaignHtml(c.body, r.name, ctx.tenant.business_name, unsubscribe),
            replyTo: ctx.tenant.contact_email ?? undefined,
            headers: { "List-Unsubscribe": `<${origin}/api/unsubscribe/${r.unsubscribe_token}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
          };
        })
      );
    } catch (err) {
      console.error("Campaign batch failed:", err);
      break;
    }
    await ctx.admin.from("campaign_sends").insert(group.map((r) => ({ campaign_id: campaign.id, customer_id: r.id, tenant_id: ctx.tenant.id })));
    sent += group.length;
  }
  await ctx.admin.from("campaigns").update({ status: "sent", sent_count: sent, sent_at: new Date().toISOString() }).eq("id", campaign.id);
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.user.id,
    action: "campaign.sent",
    entityType: "campaign",
    entityId: campaign.id,
    summary: `Campaign "${c.subject}" sent to ${sent} past customer(s)`,
  });
  revalidatePath("/campaigns");
  return sent ? { ok: true, sent } : { error: "Resend refused the send - nothing went out. Try again in a few minutes." };
}
