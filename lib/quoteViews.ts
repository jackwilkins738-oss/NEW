// Quote opens (migration 057): which opens count, and how they read on the
// dashboard.

// Email security scanners (Outlook Safe Links, Gmail, Mimecast...) open every
// link in an email as it's delivered. They'd make every quote look "opened"
// the moment it's sent, so known bots don't count, and nor does an open in
// the first minute after sending - a customer who reads it that fast will
// open it again anyway.
const BOT_UA = /bot|crawler|spider|preview|scanner|safelinks|proofpoint|mimecast|barracuda|headless|python|curl|wget|go-http|java\/|okhttp|facebookexternalhit|whatsapp|slackbot|discordbot|google-?read-?aloud/i;
const SCANNER_WINDOW_MS = 60_000;

export function countsAsView(o: {
  status: string;
  sentAt: string | null;
  userAgent: string | null;
  isTeamMember: boolean;
  now: number;
}): boolean {
  if (o.status !== "sent" || o.isTeamMember) return false;
  if (!o.userAgent || BOT_UA.test(o.userAgent)) return false;
  if (o.sentAt && o.now - Date.parse(o.sentAt) < SCANNER_WINDOW_MS) return false;
  return true;
}

function ago(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

/** "Not opened yet" / "Opened · 2h ago" / "Opened 3× · last 2h ago" - for a sent quote. */
export function viewSummary(viewCount: number | null | undefined, lastViewedAt: string | null | undefined, now: number): string {
  if (!viewCount || !lastViewedAt) return "Not opened yet";
  const when = ago(now - Date.parse(lastViewedAt));
  return viewCount === 1 ? `Opened · ${when}` : `Opened ${viewCount}× · last ${when}`;
}
