import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

import { billingStart, billingStatusFor, planIncludes, planLabel, planOf } from "./billing";
import { monthlyReportEmail, previousMonth } from "./monthlyReport";

describe("billing start", () => {
  const now = new Date("2026-10-01T10:00:00Z");

  it("waits for the free period to end", () => {
    const start = billingStart("2026-10-01", 12, now);
    expect(start).toEqual({ trialEnd: Math.floor(Date.parse("2027-10-01T09:00:00Z") / 1000), startsOn: "2027-10-01" });
  });

  it("starts at once when the free period is over or unset", () => {
    expect(billingStart("2025-01-01", 12, now)).toEqual({ trialEnd: null, startsOn: "2026-10-01" });
    expect(billingStart(null, 12, now)).toEqual({ trialEnd: null, startsOn: "2026-10-01" });
  });

  it("refuses a free period too long for Stripe (a founding client's 24 months)", () => {
    const start = billingStart("2026-10-01", 24, now);
    expect("error" in start && start.error).toMatch(/too far ahead/);
  });

  it("maps Stripe's statuses", () => {
    expect(billingStatusFor("trialing")).toBe("trialing");
    expect(billingStatusFor("active")).toBe("active");
    expect(billingStatusFor("unpaid")).toBe("past_due");
    expect(billingStatusFor("canceled")).toBe("cancelled");
  });
});

describe("monthly report", () => {
  it("covers the month before, across a year end", () => {
    expect(previousMonth("2026-10-01")).toEqual({ from: "2026-09-01", to: "2026-10-01", label: "September 2026" });
    expect(previousMonth("2027-01-01")).toEqual({ from: "2026-12-01", to: "2027-01-01", label: "December 2026" });
  });

  it("says nothing for an empty month, and the numbers otherwise", () => {
    const none = { visits: 0, enquiries: 0, quotesSent: 0, quotesWon: 0, wonPence: 0, reviews: 0 };
    expect(monthlyReportEmail("Kerr", "September 2026", none, "https://x/dashboard")).toBeNull();
    const email = monthlyReportEmail("Kerr & Sons", "September 2026", { ...none, visits: 212, enquiries: 9, quotesWon: 2, wonPence: 840_000 }, "https://x/dashboard")!;
    expect(email.subject).toBe("September 2026 for Kerr & Sons: 9 enquiries, £8,400 won");
    expect(email.html).toContain("Kerr &amp; Sons");
    expect(email.html).toContain("2 (£8,400)");
    expect(email.html).not.toContain("New reviews");
    expect(email.html).not.toContain("Taps on");
  });

  it("counts taps on their phone number and WhatsApp, and a month of only taps still gets a report", () => {
    const none = { visits: 0, enquiries: 0, quotesSent: 0, quotesWon: 0, wonPence: 0, reviews: 0 };
    const email = monthlyReportEmail("Kerr", "September 2026", { ...none, callTaps: 14, whatsappTaps: 3 }, "https://x/dashboard")!;
    expect(email.html).toContain("Taps on your phone number");
    expect(email.html).toContain(">14<");
    expect(email.html).toContain("Taps on WhatsApp");
  });
});

describe("care plans", () => {
  it("treats unknown or missing plans as Care", () => {
    expect(planOf("growth")).toBe("growth");
    expect(planOf("pro")).toBe("pro");
    expect(planOf(undefined)).toBe("care");
    expect(planOf("platinum")).toBe("care");
  });

  it("switches features on by plan", () => {
    expect(planIncludes("care", "review_requests")).toBe(true);
    expect(planIncludes("care", "google_posts")).toBe(false);
    expect(planIncludes("growth", "seo_pages")).toBe(true);
    expect(planIncludes("growth", "missed_calls")).toBe(false);
    expect(planIncludes("growth", "campaigns")).toBe(true);
    expect(planIncludes("care", "campaigns")).toBe(false);
    expect(planIncludes("pro", "missed_calls")).toBe(true);
  });

  it("labels prices", () => {
    expect(planLabel("care")).toBe("Care - £39/month");
    expect(planLabel("growth")).toBe("Growth - £149/month");
  });

  it("bills paid plans from today, even in the free period", () => {
    const now = new Date("2026-10-01T12:00:00Z");
    expect(billingStart("2026-10-01", 12, now, "growth")).toEqual({ trialEnd: null, startsOn: "2026-10-01" });
    expect("trialEnd" in billingStart("2026-10-01", 12, now, "care") && billingStart("2026-10-01", 12, now, "care")).toMatchObject({
      startsOn: "2027-10-01",
    });
  });
});
