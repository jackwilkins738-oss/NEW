"use server";

// The people around a job: the tenant's own team members, their suppliers,
// and the log of communications with a customer.
//
// Split out of the single 1,576-line app/actions.ts; app/actions.ts is now
// a barrel that re-exports this, so import sites are unchanged.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addTeamMember(formData: FormData) {
  const tenantId = String(formData.get("tenantId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!tenantId || !name) return;

  const costPerHourPounds = formData.get("costPerHour");
  const insert: Record<string, unknown> = {
    tenant_id: tenantId,
    name,
    role: String(formData.get("role") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
  };
  if (costPerHourPounds !== null && String(costPerHourPounds).trim() !== "") {
    const pounds = Number(costPerHourPounds);
    if (Number.isFinite(pounds) && pounds >= 0) insert.cost_per_hour_pence = Math.round(pounds * 100);
  }

  await createClient().from("team_members").insert(insert);
  revalidatePath("/team");
}

export async function deleteTeamMember(id: string) {
  const supabase = createClient();
  await supabase.from("team_members").delete().eq("id", id);
  revalidatePath("/team");
}

// RLS on project_team_members (migration 025) is what actually stops
// assigning someone to a project outside the caller's own tenant - it joins
// through projects -> memberships rather than trusting the ids passed in.
export async function assignTeamMemberToProject(projectId: string, teamMemberId: string) {
  const supabase = createClient();
  await supabase.from("project_team_members").upsert({ project_id: projectId, team_member_id: teamMemberId });
  revalidatePath(`/projects/${projectId}`);
}

export async function unassignTeamMemberFromProject(projectId: string, teamMemberId: string) {
  const supabase = createClient();
  await supabase
    .from("project_team_members")
    .delete()
    .eq("project_id", projectId)
    .eq("team_member_id", teamMemberId);
  revalidatePath(`/projects/${projectId}`);
}

export async function addSupplier(formData: FormData) {
  const tenantId = String(formData.get("tenantId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!tenantId || !name) return;

  await createClient()
    .from("suppliers")
    .insert({
      tenant_id: tenantId,
      name,
      contact_name: String(formData.get("contactName") ?? "").trim() || null,
      account_number: String(formData.get("accountNumber") ?? "").trim() || null,
      phone: String(formData.get("phone") ?? "").trim() || null,
      email: String(formData.get("email") ?? "").trim() || null,
      categories: String(formData.get("categories") ?? "").trim() || null,
    });

  revalidatePath("/suppliers");
}

export async function deleteSupplier(id: string) {
  const supabase = createClient();
  await supabase.from("suppliers").delete().eq("id", id);
  revalidatePath("/suppliers");
}

const COMMUNICATION_TYPES = ["email", "sms", "call", "note"];

export async function addCommunication(formData: FormData) {
  const tenantId = String(formData.get("tenantId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  const type = String(formData.get("type") ?? "note");
  const summary = String(formData.get("summary") ?? "").trim();
  if (!tenantId || !projectId || !summary) return;

  await createClient()
    .from("communications")
    .insert({
      tenant_id: tenantId,
      project_id: projectId,
      type: COMMUNICATION_TYPES.includes(type) ? type : "note",
      summary,
    });

  revalidatePath(`/projects/${projectId}`);
}

export async function deleteCommunication(projectId: string, id: string) {
  const supabase = createClient();
  await supabase.from("communications").delete().eq("id", id);
  revalidatePath(`/projects/${projectId}`);
}
