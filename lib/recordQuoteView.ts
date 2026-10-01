import * as Sentry from "@sentry/nextjs";
import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { sendPush } from "@/lib/push";
import { countsAsView } from "@/lib/quoteViews";

/**
 * Records the customer opening their quote (migration 057), and on the first
 * open tells the business's phones - they're looking at it now, the best time
 * to ring. Never throws and never holds up the page: a database without 057,
 * or any other failure, just means the open isn't counted.
 */
export async function recordQuoteView(
  admin: SupabaseClient,
  quote: { id: string; tenant_id: string; status: string; client_name: string; sent_at?: string | null }
): Promise<void> {
  try {
    if (quote.status !== "sent") return;
    const userAgent = (await headers()).get("user-agent");
    // The business previewing its own quote isn't the customer opening it.
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    let isTeamMember = false;
    if (auth.user) {
      const { data: m } = await admin
        .from("memberships")
        .select("id")
        .eq("tenant_id", quote.tenant_id)
        .eq("user_id", auth.user.id)
        .limit(1)
        .maybeSingle();
      isTeamMember = !!m;
    }
    if (!countsAsView({ status: quote.status, sentAt: quote.sent_at ?? null, userAgent, isTeamMember, now: Date.now() })) return;
    const { data: count, error } = await admin.rpc("record_quote_view", { q: quote.id });
    if (error || count !== 1) return;
    await sendPush(admin, quote.tenant_id, {
      title: `${quote.client_name} opened your quote`,
      body: "They're looking at it now - a good moment to give them a ring.",
      url: "/dashboard#quotes",
    });
  } catch (err) {
    Sentry.captureException(err);
  }
}
