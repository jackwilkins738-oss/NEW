import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken, type CalendarConnection } from "@/lib/calendarConnection";
import { getEvent } from "@/lib/googleCalendar";
import { sendPaymentReminders } from "@/lib/paymentReminders";
import { sendQuoteChasers } from "@/lib/quoteChasers";
import { sendReviewRequests } from "@/lib/reviewRequests";
import { sendVisitReminders } from "@/lib/visitReminders";
import { sendMorningBriefs } from "@/lib/morningBrief";
import { resetDemoIfPresent } from "@/lib/demo";
import { sendAftercareReminders } from "@/lib/aftercare";

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

  // No early return when nothing is linked to Google Calendar: the daily
  // emails below run from this same cron and must still go out.
  const linked = projects ?? [];
  const tenantIds = [...new Set(linked.map((p) => p.tenant_id))];
  const { data: memberships } = tenantIds.length
    ? await admin.from("memberships").select("tenant_id, user_id").in("tenant_id", tenantIds)
    : { data: [] };

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

  for (const project of linked) {
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

  const reminders = await sendPaymentReminders().catch((err) => {
    console.error("Payment reminders failed:", err);
    Sentry.captureException(err);
    return null;
  });
  // Scalar's own aftercare steps for its customers (lib/aftercare.ts) - a
  // failure here must not fail the calendar sync and payment reminders.
  const aftercare = await sendAftercareReminders().catch((err) => {
    console.error("Aftercare reminders failed:", err);
    Sentry.captureException(err);
    return { sent: 0 };
  });

  const chasers = await sendQuoteChasers().catch((err) => {
    console.error("Quote chasers failed:", err);
    Sentry.captureException(err);
    return { checked: 0, sent: 0 };
  });

  const reviews = await sendReviewRequests().catch((err) => {
    console.error("Review requests failed:", err);
    Sentry.captureException(err);
    return { checked: 0, sent: 0 };
  });

  const visits = await sendVisitReminders().catch((err) => {
    console.error("Visit reminders failed:", err);
    Sentry.captureException(err);
    return { checked: 0, sent: 0 };
  });

  // Last of the emails, so it reflects anything the steps above changed.
  const briefs = await sendMorningBriefs().catch((err) => {
    console.error("Morning briefs failed:", err);
    Sentry.captureException(err);
    return { sent: 0 };
  });

  // The sales demo's data, fresh every morning (lib/demo.ts) - same rule: never fails the rest.
  const demo = await resetDemoIfPresent(admin).catch((err) => {
    console.error("Demo reset failed:", err);
    Sentry.captureException(err);
    return false;
  });

  return NextResponse.json({ ok: true, checked, updated, reminders, aftercare, chasers, reviews, visits, briefs, demo });
}
