"use server";

import { getCurrentTenant } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/membershipRole";
import { planIncludes } from "@/lib/plans";
import { askClaude, AIUnavailable } from "@/lib/ai";
import { cleanReply, parseReview, replyPrompt, REPLIES_PER_DAY } from "@/lib/reviewReplies";

// A drafted reply to a Google review the owner pasted in (Growth plan and
// up). Members only, capped per client per day (migration 067) - the
// Anthropic bill is Scalar's.
export async function draftReviewReply(input: { reviewer: string; rating: number | null; text: string }): Promise<{ reply: string } | { error: string }> {
  const tenant = await getCurrentTenant();
  if (!tenant) return { error: "Sign in again." };
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user || !(await getCurrentUserRole(supabase, tenant.id, userData.user.id))) return { error: "Sign in again." };

  const admin = createAdminClient();
  const { data: planRow } = await admin.from("tenants").select("plan").eq("id", tenant.id).maybeSingle();
  if (!planIncludes(planRow?.plan, "review_replies")) return { error: "Review replies are part of the Growth plan." };

  const review = parseReview(input);
  if ("error" in review) return review;

  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count, error: usageError } = await admin
    .from("ai_usage")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenant.id)
    .eq("kind", "review_reply")
    .gte("created_at", since);
  if (usageError) return { error: "Not switched on yet - Scalar Digital needs to finish setting it up." };
  if ((count ?? 0) >= REPLIES_PER_DAY) return { error: `That's ${REPLIES_PER_DAY} replies in a day - try again tomorrow.` };

  try {
    const reply = cleanReply(await askClaude(replyPrompt(tenant.business_name, review)));
    if (!reply) return { error: "No reply came back - try again." };
    await admin.from("ai_usage").insert({ tenant_id: tenant.id, kind: "review_reply" });
    return { reply };
  } catch (err) {
    console.error("Review reply draft failed:", err);
    return { error: err instanceof AIUnavailable ? "Not switched on yet - Scalar Digital needs to finish setting it up." : "That didn't work - try again." };
  }
}
