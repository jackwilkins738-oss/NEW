// Every "is this overdue / due today" check in this app compares a plain
// YYYY-MM-DD calendar date (due_date, target_date - never a timestamp)
// against "today". Deriving "today" via `new Date().setHours(0,0,0,0)`
// anchors it to the server's own local time, which on Vercel is always
// UTC regardless of which edge region served the request - during
// British Summer Time (UTC+1), UTC lags the UK's actual calendar day by
// up to an hour right around midnight, so the server can think it's
// still "yesterday" for a while after the UK's day has genuinely turned
// over. Comparing calendar-date strings computed via the UK's own
// timezone side-steps the problem entirely - no Date-object arithmetic,
// no instant, just two YYYY-MM-DD strings that sort correctly as text.
export function todayInUK(reference: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(reference);
}

// dateStr is strictly before today's UK calendar date.
export function isPastUK(dateStr: string, reference: Date = new Date()): boolean {
  return dateStr < todayInUK(reference);
}

// dateStr is today's UK calendar date or earlier.
export function isTodayOrPastUK(dateStr: string, reference: Date = new Date()): boolean {
  return dateStr <= todayInUK(reference);
}

// Whole-day difference between two YYYY-MM-DD strings (positive when b is
// later than a) - plain calendar-day arithmetic, not an instant
// subtraction, so it's never off by the current UTC/BST offset the way
// `(new Date(b) - new Date(a)) / 86400000` can be near a DST transition.
export function daysBetweenUK(aDateStr: string, bDateStr: string): number {
  const a = new Date(aDateStr + "T00:00:00Z");
  const b = new Date(bDateStr + "T00:00:00Z");
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}
