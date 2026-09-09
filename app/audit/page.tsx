import { redirect } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { brandThemeStyleTag } from "@/lib/theme";
import { signOut } from "@/app/login/actions";
import { AppSidebar } from "@/components/AppSidebar";
import { getCurrentUserRole } from "@/lib/membershipRole";
import { IconDocument } from "@/components/DashboardIcons";

export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, string> = {
  "invoice.marked_paid": "Invoice marked paid",
  "invoice.payment_recorded": "Payment recorded",
  "invoice.deleted": "Invoice deleted",
  "invoice.paid_online": "Invoice paid online",
  "lead.deleted": "Lead deleted",
  "quote.deleted": "Quote deleted",
  "quote.accepted": "Quote accepted",
  "quote.declined": "Quote declined",
  "project.deleted": "Project deleted",
  "project.completed": "Project completed",
  "variation.approved": "Variation approved",
  "variation.declined": "Variation declined",
  "variation.deleted": "Variation deleted",
  "tenant.settings_updated": "Settings updated",
  "membership.removed": "Access removed",
  "membership.role_changed": "Access level changed",
};

export default async function AuditLogPage() {
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/login");

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");
  const role = await getCurrentUserRole(supabase, tenant.id, userData.user.id);
  // Same restriction as Settings - this is a record of everyone's actions,
  // not just your own, so it gets the same owner-only treatment.
  if (role === "member") redirect("/dashboard");

  const { data: entries } = await supabase
    .from("audit_log")
    .select("id, user_id, action, entity_type, summary, created_at")
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = entries ?? [];
  const userIds = [...new Set(rows.map((r) => r.user_id).filter((id): id is string => !!id))];
  const emailById = new Map<string, string>();
  if (userIds.length > 0) {
    const admin = createAdminClient();
    await Promise.all(
      userIds.map(async (id) => {
        const { data } = await admin.auth.admin.getUserById(id);
        if (data.user?.email) emailById.set(id, data.user.email);
      })
    );
  }

  return (
    <main className="min-h-screen bg-page sm:pl-64">
      <style dangerouslySetInnerHTML={{ __html: brandThemeStyleTag(tenant.brand_theme) }} />
      <AppSidebar businessName={tenant.business_name} logoUrl={tenant.logo_url} signOutAction={signOut} role={role ?? "owner"} />
      <div className="mx-auto max-w-3xl px-6 py-8">
        <header className="rounded-2xl border border-black/8 bg-surface px-5 py-4 shadow-sm">
          <h1 className="flex items-center gap-2 font-display text-xl font-extrabold text-ink sm:text-2xl">
            <IconDocument className="h-5 w-5 text-brand" />
            Audit log
          </h1>
          <p className="mt-1 text-sm text-muted">
            Who did what, and when - deletions, payments, approvals and settings changes. The last 200 entries.
          </p>
        </header>

        <div className="mt-5 rounded-2xl border border-black/8 bg-surface p-5 shadow-sm">
          {rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-black/15 py-8 text-center">
              <p className="text-sm font-semibold text-ink">Nothing recorded yet</p>
              <p className="mt-1 px-2 text-sm text-muted">
                Deletions, payments, approvals and settings changes will show up here as they happen.
              </p>
            </div>
          ) : (
            <div className="flex flex-col">
              {rows.map((r) => (
                <div key={r.id} className="border-b border-black/8 py-2.5 last:border-none">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-ink-2">{r.summary}</p>
                    <p className="whitespace-nowrap text-xs text-muted">
                      {new Date(r.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}{" "}
                      {new Date(r.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {ACTION_LABEL[r.action] ?? r.action} &middot; {r.user_id ? (emailById.get(r.user_id) ?? "Unknown user") : "Customer"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
