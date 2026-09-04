"use client";

import { useTransition } from "react";
import { disconnectGoogleCalendar } from "@/app/dashboard/actions";

type CalendarEvent = { id: string; summary: string; start: string; htmlLink: string };

function formatEventTime(iso: string) {
  const d = new Date(iso);
  const isAllDay = iso.length === 10; // date-only strings ("2026-11-14") come through for all-day events
  if (isAllDay) return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function CalendarPanel({ connected, events }: { connected: boolean; events: CalendarEvent[] }) {
  const [isPending, startTransition] = useTransition();

  if (!connected) {
    return (
      <div className="rounded-2xl border border-black/10 bg-surface p-5 shadow-sm">
        <h2 className="text-sm font-bold text-ink">Your calendar</h2>
        <p className="mt-1 text-sm text-muted">
          Connect Google Calendar to see your day-to-day appointments here alongside your jobs, and have each job&apos;s
          next site visit added straight to your calendar.
        </p>
        <a
          href="/api/calendar/google/connect"
          className="mt-3 inline-block rounded-md bg-brand px-3 py-2 text-sm font-bold text-white hover:bg-brand-strong"
        >
          Connect Google Calendar
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-black/10 bg-surface p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-ink">Your calendar</h2>
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            if (confirm("Disconnect Google Calendar? Jobs will stop syncing until you reconnect.")) {
              startTransition(() => {
                disconnectGoogleCalendar();
              });
            }
          }}
          className="text-xs font-semibold text-muted hover:text-critical disabled:opacity-60"
        >
          Disconnect
        </button>
      </div>
      <div className="mt-3 flex flex-col gap-2.5">
        {events.length === 0 ? (
          <p className="text-sm text-muted">Nothing on your calendar in the next couple of weeks.</p>
        ) : (
          events.map((e) => (
            <a
              key={e.id}
              href={e.htmlLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-2 rounded-lg border border-black/10 px-3 py-2 hover:bg-surface-2"
            >
              <span className="text-sm font-medium text-ink">{e.summary}</span>
              <span className="whitespace-nowrap text-xs font-semibold text-muted">{formatEventTime(e.start)}</span>
            </a>
          ))
        )}
      </div>
    </div>
  );
}
