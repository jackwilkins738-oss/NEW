// Prospect filmstrips and screenshots are only for the outreach window: after
// SHOTS_KEEP_DAYS they're stripped from the teardown, so a few KB per prospect
// never piles up in the table. Run weekly from the digest cron.

import type { SupabaseClient } from "@supabase/supabase-js";
import { SHOTS_KEEP_DAYS } from "./prospects";

export function withoutShots(teardown: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...teardown };
  delete rest.frames;
  delete rest.screenshot;
  return rest;
}

export async function pruneProspectShots(admin: SupabaseClient, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - SHOTS_KEEP_DAYS * 86_400_000).toISOString();
  const { data, error } = await admin
    .from("prospects")
    .select("id, teardown")
    .lt("teardown_at", cutoff)
    .or("teardown->>screenshot.not.is.null,teardown->frames.not.is.null")
    .limit(500);
  if (error || !data) return 0;
  let pruned = 0;
  for (const row of data as { id: string; teardown: Record<string, unknown> | null }[]) {
    if (!row.teardown) continue;
    const { error: updateError } = await admin
      .from("prospects")
      .update({ teardown: withoutShots(row.teardown) })
      .eq("id", row.id);
    if (!updateError) pruned++;
  }
  return pruned;
}
