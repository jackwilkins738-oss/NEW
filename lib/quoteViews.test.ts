import { describe, expect, it } from "vitest";
import { countsAsView, viewSummary } from "./quoteViews";

const NOW = Date.parse("2026-10-01T12:00:00Z");
const PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
const base = { status: "sent", sentAt: "2026-10-01T09:00:00Z", userAgent: PHONE, isTeamMember: false, now: NOW };

describe("quote views", () => {
  it("counts the customer opening a sent quote", () => {
    expect(countsAsView(base)).toBe(true);
  });

  it("ignores email scanners, the business itself, and decided quotes", () => {
    expect(countsAsView({ ...base, userAgent: "Mozilla/5.0 (compatible; Microsoft Office SafeLinks)" })).toBe(false);
    expect(countsAsView({ ...base, userAgent: "WhatsApp/2.23" })).toBe(false); // link preview, not a person
    expect(countsAsView({ ...base, userAgent: null })).toBe(false);
    expect(countsAsView({ ...base, sentAt: "2026-10-01T11:59:30Z" })).toBe(false); // opened within a minute of sending
    expect(countsAsView({ ...base, isTeamMember: true })).toBe(false);
    expect(countsAsView({ ...base, status: "accepted" })).toBe(false);
    expect(countsAsView({ ...base, status: "draft" })).toBe(false);
  });

  it("reads plainly on the dashboard", () => {
    expect(viewSummary(0, null, NOW)).toBe("Not opened yet");
    expect(viewSummary(1, "2026-10-01T10:00:00Z", NOW)).toBe("Opened · 2h ago");
    expect(viewSummary(3, "2026-10-01T11:55:00Z", NOW)).toBe("Opened 3× · last 5m ago");
    expect(viewSummary(2, "2026-09-28T12:00:00Z", NOW)).toBe("Opened 2× · last 3 days ago");
  });
});
