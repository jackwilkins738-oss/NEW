"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const VALID_STATUSES = ["new", "contacted", "quoted", "won", "lost"];

// Row-level security (see supabase/schema.sql) is what actually stops one
// tenant's member updating another tenant's lead - the .eq("id", leadId)
// here just narrows the query, it isn't the security boundary.
export async function updateLeadStatus(leadId: string, status: string) {
  if (!VALID_STATUSES.includes(status)) return;

  const supabase = createClient();
  await supabase
    .from("leads")
    .update({ status, status_updated_at: new Date().toISOString() })
    .eq("id", leadId);

  revalidatePath("/dashboard");
}
