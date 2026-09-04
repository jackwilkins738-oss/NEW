import { createAdminClient } from "@/lib/supabase/admin";
import { refreshAccessToken } from "@/lib/googleCalendar";

export type CalendarConnection = {
  id: string;
  user_id: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
  google_calendar_id: string;
};

// calendar_connections has no RLS policies at all (see
// supabase/migrations/011_calendar_connections.sql) - always read/write it
// through the admin client, never the session-scoped one, even when acting
// on the signed-in user's own row.
export async function getCalendarConnection(userId: string): Promise<CalendarConnection | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("calendar_connections").select("*").eq("user_id", userId).maybeSingle();
  return data;
}

// Google access tokens last ~1 hour. Refreshes (and persists) a new one
// whenever the stored one is expired or close to it, so callers never have
// to think about expiry themselves.
export async function getValidAccessToken(connection: CalendarConnection): Promise<string> {
  const expiresInMs = new Date(connection.token_expires_at).getTime() - Date.now();
  if (expiresInMs > 60_000) return connection.access_token;

  const refreshed = await refreshAccessToken(connection.refresh_token);
  const admin = createAdminClient();
  await admin
    .from("calendar_connections")
    .update({
      access_token: refreshed.access_token,
      token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
    })
    .eq("id", connection.id);

  return refreshed.access_token;
}
