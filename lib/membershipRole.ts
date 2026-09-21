import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export type MembershipRole = "owner" | "member";

// Enforced at the app layer (a redirect on the Settings page, a hidden
// nav link) rather than rewriting RLS across every table - this app's
// existing policies already scope every query to "any member of this
// tenant," and rewriting that per-table to also check role is real
// surgery across ~15 tables with no way to test a live policy change
// before it ships. App-layer gating solves the actual problem asked for
// (a limited view for office/field staff) without that risk; tightening
// it to the database layer is a real future hardening step, not this one.
export async function getCurrentUserRole(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string
): Promise<MembershipRole | null> {
  const { data } = await supabase.from("memberships").select("role").eq("tenant_id", tenantId).eq("user_id", userId).maybeSingle();
  return (data?.role as MembershipRole | undefined) ?? null;
}

// Same lookup, but keyed only on the two ids so React's cache() can actually
// dedupe it - the caller-supplied SupabaseClient above is a fresh object on
// every call, which would make each one a cache miss. Used by the shared
// (app) layout (to decide which nav links to show) and by the pages that
// enforce owner-only access, so a request that does both pays for one query.
export const getCurrentUserRoleCached = cache(async function getCurrentUserRoleCached(
  tenantId: string,
  userId: string
): Promise<MembershipRole | null> {
  return getCurrentUserRole(createClient(), tenantId, userId);
});
