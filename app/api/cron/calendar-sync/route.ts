import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken, type CalendarConnection } from "@/lib/calendarConnection";
import { getEvent } from "@/lib/googleCalendar";
import { sendPaymentReminders } from "@/lib/paymentReminders";

// The other direction of the sync described on CalendarPanel: dashboard ->
// Google already happens instantly (syncNextVisitToCalendar in
// app/dashboard/actions.ts, on every project save). This is Google ->
// dashboard - if the owner drags an event to a new time (or deletes it)
// directly in Google Calendar, the project's next_visit_at needs to catch
// up. There's no realistic way to do that instantly without a webhook
// subscription (Google's `watch` API - a whole extra piece of
// infrastructure: a public callback endpoint, a channel per calendar, and
// channels that expire and need renewing every few days). Polling on a
// schedule is simpler and more robust, at the cost of a delay up to the
// cron interval - fine for a site-visit date, which nobody needs updated
// to the second.
//
// calendar_connections is keyed by user, not by tenant (see
// lib/calendarConnection.ts) - a project doesn't record which user's
// connection created its event, so this checks every member of a tenant
// and uses whichever one actually has a connection. In practice a tenant
// has one active user, so this is rarely ambiguous.
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: projects } = await admin
    .from("projects")
    .select("id, tenant_id, client_name, next_visit_at, google_event_id")
    .not("google_event_id", "is", null);

  if (!projects || projects.length === 0) return NextResponse.json({ ok: true, checked: 0, updated: 0 });

  const tenantIds = [...new Set(projects.map((p) => p.tenant_id))];
  const { data: memberships } = await admin.from("memberships").select("tenant_id, user_id").in("tenant_id", tenantIds);

  // One connection per tenant (first member who has one), cached so a
  // tenant with many projects doesn't re-fetch/refresh the same token
  // per-project.
  const connectionByTenant = new Map<string, CalendarConnection | null>();
  async function connectionFor(tenantId: string): Promise<CalendarConnection | null> {
    if (connectionByTenant.has(tenantId)) return connectionByTenant.get(tenantId)!;
    const userIds = (memberships ?? []).filter((m) => m.tenant_id === tenantId).map((m) => m.user_id);
    let found: CalendarConnection | null = null;
    for (const userId of userIds) {
      const { data } = await admin.from("calendar_connections").select("*").eq("user_id", userId).maybeSingle();
      if (data) {
        found = data;
        break;
      }
    }
    connectionByTenant.set(tenantId, found);
    return found;
  }

  let checked = 0;
  let updated = 0;

  for (const project of projects) {
    try {
      const connection = await connectionFor(project.tenant_id);
      if (!connection) continue;

      checked++;
      const accessToken = await getValidAccessToken(connection);
      const event = await getEvent(accessToken, connection.google_calendar_id, project.google_event_id!);

      if (!event || event.status === "cancelled") {
        // Deleted (or cancelled) directly in Google Calendar - clear both
        // sides rather than leaving a dangling reference to an event that
        // no longer exists.
        await admin.from("projects").update({ next_visit_at: null, google_event_id: null }).eq("id", project.id);
        updated++;
        continue;
      }

      const googleStart = new Date(event.start).toISOString();
      const currentStart = project.next_visit_at ? new Date(project.next_visit_at).toISOString() : null;
      if (googleStart !== currentStart) {
        await admin.from("projects").update({ next_visit_at: googleStart }).eq("id", project.id);
        updated++;
      }
    } catch (err) {
      console.error(`Calendar sync failed for project ${project.id}:`, err);
      Sentry.captureException(err);
    }
  }

  const reminders = await sendPaymentReminders();

  return NextResponse.json({ ok: true, checked, updated, reminders });
}
