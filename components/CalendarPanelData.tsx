import * as Sentry from "@sentry/nextjs";
import { getCalendarConnection, getValidAccessToken } from "@/lib/calendarConnection";
import { listUpcomingEvents } from "@/lib/googleCalendar";
import { CalendarPanel } from "@/components/CalendarPanel";

// Split out from the main dashboard page so a slow/hiccuping Google API call
// (real network round-trip, sometimes an OAuth token refresh on top) is
// wrapped in its own <Suspense> boundary and streamed in separately -
// leads/invoices/projects/alerts etc. no longer wait on Google to render.
export async function CalendarPanelData({ userId }: { userId: string }) {
  const calendarConnection = await getCalendarConnection(userId);
  let calendarEvents: { id: string; summary: string; start: string; end: string; htmlLink: string }[] = [];

  if (calendarConnection) {
    try {
      const accessToken = await getValidAccessToken(calendarConnection);
      const in14Days = new Date(Date.now() + 14 * 86_400_000);
      calendarEvents = await listUpcomingEvents(accessToken, calendarConnection.google_calendar_id, new Date(), in14Days);
    } catch (err) {
      console.error("Failed to load Google Calendar events:", err);
      Sentry.captureException(err);
    }
  }

  return <CalendarPanel connected={!!calendarConnection} events={calendarEvents} />;
}
