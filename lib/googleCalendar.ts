// Plain fetch against Google's REST API, deliberately not the `googleapis`
// SDK - same call made for Resend (see app/api/leads/route.ts): the surface
// used here is small enough that a large, version-fragile SDK isn't worth
// it.

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

function redirectUri() {
  return "https://admin.scalardigital.co.uk/api/calendar/google/callback";
}

// `state` is opaque to Google - just carried through to the callback - so a
// plain base64 JSON blob is fine, nothing secret goes in it.
export function encodeState(data: { userId: string; returnTo: string }) {
  return Buffer.from(JSON.stringify(data)).toString("base64url");
}

export function decodeState(state: string): { userId: string; returnTo: string } | null {
  try {
    return JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export function buildAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    // offline + consent: without both, Google only returns a refresh_token
    // the very first time an account ever connects - reconnecting after a
    // disconnect would silently stop working.
    access_type: "offline",
    prompt: "consent",
    scope: "https://www.googleapis.com/auth/calendar.events",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

export async function exchangeCodeForTokens(code: string) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri(),
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as TokenResponse;
}

export async function refreshAccessToken(refreshToken: string) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as TokenResponse;
}

export type CalendarEvent = {
  id: string;
  summary: string;
  start: string; // ISO
  end: string; // ISO
  htmlLink: string;
};

export async function listUpcomingEvents(
  accessToken: string,
  calendarId: string,
  timeMin: Date,
  timeMax: Date
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "10",
  });
  const res = await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Google Calendar list failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as {
    items?: {
      id: string;
      summary?: string;
      start: { dateTime?: string; date?: string };
      end: { dateTime?: string; date?: string };
      htmlLink: string;
    }[];
  };
  return (data.items ?? []).map((item) => ({
    id: item.id,
    summary: item.summary ?? "(untitled)",
    start: (item.start.dateTime ?? item.start.date)!,
    end: (item.end.dateTime ?? item.end.date)!,
    htmlLink: item.htmlLink,
  }));
}

// Creates the event if `existingEventId` is null, otherwise updates it in
// place - this is what stops a project's site-visit date change from
// creating a duplicate calendar entry. Returns the Google event id to store
// back on the project row.
export async function upsertEvent(
  accessToken: string,
  calendarId: string,
  existingEventId: string | null,
  event: { summary: string; description?: string; startIso: string }
): Promise<string> {
  const endIso = new Date(new Date(event.startIso).getTime() + 60 * 60_000).toISOString();
  const body = JSON.stringify({
    summary: event.summary,
    description: event.description,
    start: { dateTime: event.startIso },
    end: { dateTime: endIso },
  });

  const url = existingEventId
    ? `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${existingEventId}`
    : `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`;

  const res = await fetch(url, {
    method: existingEventId ? "PATCH" : "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body,
  });
  if (!res.ok) throw new Error(`Google Calendar upsert failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.id;
}

export async function deleteEvent(accessToken: string, calendarId: string, eventId: string) {
  const res = await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  // 410 Gone = already deleted on Google's side - not an error for our purposes.
  if (!res.ok && res.status !== 410 && res.status !== 404) {
    throw new Error(`Google Calendar delete failed: ${res.status} ${await res.text()}`);
  }
}
