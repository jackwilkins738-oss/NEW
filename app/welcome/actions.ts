"use server";

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/auditLog";
import { sendEmail } from "@/lib/email";
import { tenantOrigin } from "@/lib/tenantOrigin";
import { answeredCount, normaliseAnswers, safeFilename, uploadProblem } from "@/lib/onboarding";
import { tokensMatch } from "@/lib/tokens";

// Public, unauthenticated actions for a website client's onboarding page
// (app/welcome/[id]/[token]). As with the quote page, the token IS the
// security boundary: every action re-checks it and then uses the service-role
// client, so nothing here is reachable without the link we sent them.

const BUCKET = "onboarding-uploads";

async function load(id: string, token: string) {
  if (typeof id !== "string" || typeof token !== "string" || token.length < 32) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("onboarding")
    .select("id, tenant_id, token, client_name, answers, submitted_at")
    .eq("id", id)
    .maybeSingle();
  return data && tokensMatch(data.token, token) ? { admin, row: data } : null;
}

export async function saveOnboarding(id: string, token: string, rawAnswers: unknown, submit: boolean) {
  const found = await load(id, token);
  if (!found) return { ok: false, error: "This link isn't valid any more - ask us for a new one." };
  const { admin, row } = found;
  const answers = normaliseAnswers(rawAnswers);
  const firstSubmit = submit && !row.submitted_at;
  const now = new Date().toISOString();
  const { error } = await admin
    .from("onboarding")
    .update({ answers, updated_at: now, ...(submit ? { submitted_at: now } : {}) })
    .eq("id", id);
  if (error) return { ok: false, error: "Couldn't save just now - please try again." };

  if (firstSubmit) {
    await logAudit({
      tenantId: row.tenant_id,
      action: "onboarding.submitted",
      entityType: "onboarding",
      entityId: id,
      summary: `${row.client_name} sent their website details (${answeredCount(answers)} answers)`,
    });
    const { data: tenant } = await admin
      .from("tenants")
      .select("contact_email, domain, slug")
      .eq("id", row.tenant_id)
      .maybeSingle();
    if (tenant?.contact_email) {
      await sendEmail({
        to: [tenant.contact_email],
        subject: `${row.client_name} sent their website details`,
        html: `<p>${row.client_name.replace(/[<>&]/g, "")} has filled in their onboarding page (${answeredCount(answers)} answers).</p>
          <p><a href="${tenantOrigin(tenant)}/onboarding">See everything they sent</a></p>`,
      });
    }
  }
  return { ok: true, answered: answeredCount(answers) };
}

export async function startUpload(id: string, token: string, file: { name: string; type: string; size: number }, kind: string) {
  const found = await load(id, token);
  if (!found) return { ok: false as const, error: "This link isn't valid any more." };
  const { admin, row } = found;
  const { count } = await admin.from("onboarding_files").select("id", { count: "exact", head: true }).eq("onboarding_id", id);
  const problem = uploadProblem(file, kind, count ?? 0);
  if (problem) return { ok: false as const, error: problem };
  const path = `${row.tenant_id}/${id}/${randomUUID()}-${safeFilename(file.name, file.type)}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false as const, error: "Couldn't start the upload - please try again." };
  return { ok: true as const, path, uploadToken: data.token };
}

export async function finishUpload(id: string, token: string, path: string, kind: string, filename: string) {
  const found = await load(id, token);
  if (!found) return { ok: false as const, error: "This link isn't valid any more." };
  const { admin, row } = found;
  const folder = `${row.tenant_id}/${id}`;
  if (typeof path !== "string" || !path.startsWith(`${folder}/`) || path.slice(folder.length + 1).includes("/")) {
    return { ok: false as const, error: "That upload doesn't belong here." };
  }
  // Only record what actually landed in storage, at the size storage says.
  const name = path.slice(folder.length + 1);
  const { data: listed } = await admin.storage.from(BUCKET).list(folder, { search: name, limit: 1 });
  const object = listed?.find((o) => o.name === name);
  const size = Number((object?.metadata as { size?: number } | undefined)?.size ?? 0);
  if (!object || !(size > 0)) return { ok: false as const, error: "The upload didn't arrive - please try again." };
  const safeKind = kind === "logo" || kind === "photo" ? kind : "other";
  const { data: saved, error } = await admin
    .from("onboarding_files")
    .insert({
      onboarding_id: id,
      tenant_id: row.tenant_id,
      storage_path: path,
      filename: String(filename || name).slice(0, 200),
      kind: safeKind,
      size_bytes: size,
    })
    .select("id, filename, kind")
    .single();
  if (error || !saved) return { ok: false as const, error: "Couldn't save that file - please try again." };
  return { ok: true as const, file: saved };
}

export async function removeUpload(id: string, token: string, fileId: string) {
  const found = await load(id, token);
  if (!found) return { ok: false };
  const { admin } = found;
  const { data: file } = await admin
    .from("onboarding_files")
    .select("id, storage_path")
    .eq("id", fileId)
    .eq("onboarding_id", id)
    .maybeSingle();
  if (!file) return { ok: false };
  await admin.storage.from(BUCKET).remove([file.storage_path]);
  await admin.from("onboarding_files").delete().eq("id", file.id);
  return { ok: true };
}
