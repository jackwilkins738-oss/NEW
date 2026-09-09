"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/auditLog";
import { formatGBP } from "@/lib/format";

// Public, unauthenticated actions - reached from the no-login portal page
// (app/portal/[id]/[token]). portal_token match IS the security boundary
// (same idea as tenants.site_key / quotes.accept_token), so this goes
// through the service-role admin client - there's no signed-in user for
// RLS to check. Mirrors approveVariation/declineVariation in
// app/dashboard/actions.ts exactly (same value-add-to-project, same
// cost-item creation) - the token check is the only thing that differs
// from the staff-side version.
async function verifyPortalProject(admin: ReturnType<typeof createAdminClient>, projectId: string, token: string) {
  const { data: project } = await admin.from("projects").select("id, tenant_id, portal_token").eq("id", projectId).maybeSingle();
  if (!project || project.portal_token !== token) return null;
  return project;
}

export async function customerApproveVariation(projectId: string, token: string, variationId: string) {
  const admin = createAdminClient();
  const project = await verifyPortalProject(admin, projectId, token);
  if (!project) return { ok: false };

  const { data: variation } = await admin
    .from("variations")
    .select(
      "id, tenant_id, project_id, number, description, materials_cost_pence, labour_cost_pence, other_cost_pence, customer_price_pence, status"
    )
    .eq("id", variationId)
    .maybeSingle();
  if (!variation || variation.project_id !== projectId || variation.status !== "pending") return { ok: false };

  await admin.from("variations").update({ status: "approved", approved_at: new Date().toISOString() }).eq("id", variationId);

  const { data: proj } = await admin.from("projects").select("value_pence").eq("id", projectId).maybeSingle();
  await admin
    .from("projects")
    .update({ value_pence: (proj?.value_pence ?? 0) + variation.customer_price_pence })
    .eq("id", projectId);

  const costLines: { category: string; amount: number }[] = [
    { category: "materials", amount: variation.materials_cost_pence },
    { category: "labour", amount: variation.labour_cost_pence },
    { category: "other", amount: variation.other_cost_pence },
  ].filter((l) => l.amount > 0);

  if (costLines.length > 0) {
    await admin.from("project_cost_items").insert(
      costLines.map((l) => ({
        tenant_id: variation.tenant_id,
        project_id: projectId,
        category: l.category,
        description: `${variation.number ?? "Variation"}: ${variation.description}`,
        amount_pence: l.amount,
        status: "committed",
      }))
    );
  }

  revalidatePath(`/portal/${projectId}/${token}`);
  revalidatePath(`/projects/${projectId}`);

  await logAudit({
    tenantId: variation.tenant_id,
    action: "variation.approved",
    entityType: "variation",
    entityId: variationId,
    summary: `Customer approved ${variation.number ?? "a variation"} via the portal (${formatGBP(variation.customer_price_pence)})`,
  });

  return { ok: true };
}

export async function customerDeclineVariation(projectId: string, token: string, variationId: string) {
  const admin = createAdminClient();
  const project = await verifyPortalProject(admin, projectId, token);
  if (!project) return { ok: false };

  const { data: variation } = await admin
    .from("variations")
    .select("id, tenant_id, project_id, number, customer_price_pence, status")
    .eq("id", variationId)
    .maybeSingle();
  if (!variation || variation.project_id !== projectId || variation.status !== "pending") return { ok: false };

  await admin.from("variations").update({ status: "declined" }).eq("id", variationId);
  revalidatePath(`/portal/${projectId}/${token}`);
  revalidatePath(`/projects/${projectId}`);

  await logAudit({
    tenantId: variation.tenant_id,
    action: "variation.declined",
    entityType: "variation",
    entityId: variationId,
    summary: `Customer declined ${variation.number ?? "a variation"} via the portal (${formatGBP(variation.customer_price_pence)})`,
  });

  return { ok: true };
}
