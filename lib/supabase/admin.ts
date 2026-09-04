import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role client - bypasses RLS entirely, and can create/invite auth
// users, which the anon-key client can't do. SUPABASE_SERVICE_ROLE_KEY has
// no NEXT_PUBLIC_ prefix on purpose: it must never reach the browser bundle.
// Only ever import this from server-only code (Server Actions, Route
// Handlers) - never from a "use client" file.
export function createAdminClient() {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
