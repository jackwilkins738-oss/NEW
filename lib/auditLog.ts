import { createAdminClient } from "@/lib/supabase/admin";

// Fire-and-forget by design: logging failure must never break the actual
// action it's describing (a network blip writing an audit row is not a
// reason to fail a real invoice deletion). Always goes through the
// service-role admin client - audit_log has no insert RLS policy at all,
// on purpose (see the migration), so this is the only way anything gets
// written to it.
//
// Scoped to the highest-value actions - deletions and money-moving
// operations - rather than every mutation in the app. An audit log that
// tries to record everything drowns the entries that actually matter in
// routine field edits; this covers what a "who did this, and when" review
// would actually need to answer.
export async function logAudit(entry: {
  tenantId: string;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
}) {
  try {
    const admin = createAdminClient();
    await admin.from("audit_log").insert({
      tenant_id: entry.tenantId,
      user_id: entry.userId ?? null,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      summary: entry.summary,
    });
  } catch (err) {
    console.error("Audit log write failed:", err);
  }
}
