"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// The client's say on each job post (migration 065): edit, approve or skip.
// RLS lets members change only drafts, approved and skipped posts - a
// published one is the panel's to change.
export async function saveJobPost(
  id: string,
  fields: { title: string; body: string; google_post: string },
  status: "draft" | "approved" | "skipped"
): Promise<{ ok: true } | { error: string }> {
  const title = fields.title.trim().slice(0, 120);
  const body = fields.body.trim().slice(0, 6000);
  if (status !== "skipped" && (!title || !body)) return { error: "The title and the write-up can't be empty." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_posts")
    .update({
      ...(title && body ? { title, body, google_post: fields.google_post.trim().slice(0, 1500) } : {}),
      status,
      approved_at: status === "approved" ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) return { error: "Couldn't save that - refresh and try again." };
  revalidatePath("/posts");
  return { ok: true };
}
