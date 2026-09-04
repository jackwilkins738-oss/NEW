import { createClient } from "@/lib/supabase/server";

export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const supabase = createClient();
  const { data } = await supabase.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle();
  return !!data;
}
