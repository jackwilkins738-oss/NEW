import { describe, expect, it, vi } from "vitest";

// The modules send email through the admin client; these tests only touch their pure rules.
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

import { mapsLink, onMyWay, ukVisitTime, whatsappNumber } from "./contact";
import { dueVisitReminder, visitReminderEmail } from "./visitReminders";
import { dueForNudge, ukHour } from "./enquiryNudge";
import { briefEmail, type BriefInput } from "./morningBrief";

describe("contact helpers", () => {
  it("turns UK numbers into WhatsApp form", () => {
    expect(whatsappNumber("07700 900123")).toBe("447700900123");
    expect(whatsappNumber("+44 7700 900123")).toBe("447700900123");
    expect(whatsappNumber("0044 7700 900123")).toBe("447700900123");
    expect(whatsappNumber("12345")).toBeNull();
    expect(whatsappNumber(null)).toBeNull();
  });

  it("writes the on-my-way text with their first name", () => {
    const links = onMyWay("07700 900123", "Sarah Kerr", "Ridgeview Roofing", 15);
    expect(links.text).toBe("Hi Sarah, it's Ridgeview Roofing - on my way now, with you in about 15 minutes.");
    expect(links.sms).toBe(`sms:07700900123?&body=${encodeURIComponent(links.text)}`);
    expect(links.whatsapp).toContain("https://wa.me/447700900123?text=");
    expect(onMyWay(null, "Sarah", "X", 10).sms).toBeNull();
  });

  it("shows visit times in UK time, summer and winter", () => {
    expect(ukVisitTime("2026-07-14T07:00:00Z")).toEqual({ day: "Tuesday 14 July", time: "8:00am" });
    expect(ukVisitTime("2026-12-01T13:30:00Z")).toEqual({ day: "Tuesday 1 December", time: "1:30pm" });
    expect(mapsLink("12 High St, Guildford")).toBe("https://www.google.com/maps/dir/?api=1&destination=12%20High%20St%2C%20Guildford");
  });
});

describe("visit reminders", () => {
  const now = new Date("2026-10-13T06:00:00Z"); // Tuesday morning, UK
  const visit = { next_visit_at: "2026-10-14T07:00:00Z", visit_reminded_for: null, completed_at: null };

  it("reminds the day before, once per booked time", () => {
    expect(dueVisitReminder(visit, now)).toBe(true);
    expect(dueVisitReminder({ ...visit, visit_reminded_for: "2026-10-14T07:00:00.000Z" }, now)).toBe(false);
    // Rebooked to a different time: a fresh reminder.
    expect(dueVisitReminder({ ...visit, visit_reminded_for: "2026-10-14T09:00:00Z" }, now)).toBe(true);
  });

  it("leaves today's, later, finished or undated visits alone", () => {
    expect(dueVisitReminder({ ...visit, next_visit_at: "2026-10-13T12:00:00Z" }, now)).toBe(false);
    expect(dueVisitReminder({ ...visit, next_visit_at: "2026-10-15T07:00:00Z" }, now)).toBe(false);
    expect(dueVisitReminder({ ...visit, completed_at: "2026-10-12T10:00:00Z" }, now)).toBe(false);
    expect(dueVisitReminder({ ...visit, next_visit_at: null }, now)).toBe(false);
  });

  it("uses the UK date, not UTC, around midnight", () => {
    // 23:30 UTC on the 13th is 00:30 on the 14th in BST - that's "today" for a check made on the 14th.
    expect(dueVisitReminder({ ...visit, next_visit_at: "2026-10-13T23:30:00Z" }, new Date("2026-10-13T06:00:00Z"))).toBe(true);
  });

  it("escapes the customer and business in the email", () => {
    const email = visitReminderEmail("<b>Sam</b> Lee", "Kerr & Sons", "2026-10-14T07:00:00Z", "1 High St");
    expect(email.subject).toBe("See you tomorrow at 8:00am - Kerr & Sons");
    expect(email.html).toContain("Hi &lt;b&gt;Sam&lt;/b&gt;,");
    expect(email.html).toContain("Kerr &amp; Sons is booked to come to 1 High St tomorrow, Wednesday 14 October");
  });
});

describe("enquiry nudges", () => {
  const lead = { status: "new", created_at: "2026-10-13T09:00:00Z", nudged_at: null };

  it("nudges once, after an hour, within a day", () => {
    expect(dueForNudge(lead, new Date("2026-10-13T10:05:00Z"))).toBe(true);
    expect(dueForNudge(lead, new Date("2026-10-13T09:45:00Z"))).toBe(false);
    expect(dueForNudge({ ...lead, nudged_at: "2026-10-13T10:05:00Z" }, new Date("2026-10-13T11:05:00Z"))).toBe(false);
    expect(dueForNudge({ ...lead, status: "contacted" }, new Date("2026-10-13T10:05:00Z"))).toBe(false);
    expect(dueForNudge(lead, new Date("2026-10-14T09:30:00Z"))).toBe(false);
  });

  it("stays quiet overnight (UK time) and catches up at 7am", () => {
    const late = { ...lead, created_at: "2026-10-13T20:30:00Z" }; // 21:30 BST
    expect(ukHour(new Date("2026-10-13T21:40:00Z"))).toBe(22);
    expect(dueForNudge(late, new Date("2026-10-13T21:40:00Z"))).toBe(false);
    expect(dueForNudge(late, new Date("2026-10-14T06:05:00Z"))).toBe(true); // 07:05 BST
  });
});

describe("morning brief", () => {
  const empty: BriefInput = {
    businessName: "Kerr Roofing",
    dashboardUrl: "https://kerr.example/dashboard",
    visits: [],
    newEnquiries: [],
    overdue: { count: 0, pence: 0 },
    quotesWaiting: { count: 0, pence: 0 },
  };

  it("sends nothing on a quiet day", () => {
    expect(briefEmail(empty)).toBeNull();
  });

  it("lists visits in time order with directions and call links", () => {
    const email = briefEmail({
      ...empty,
      visits: [
        { client: "Late", at: "2026-10-14T13:00:00Z", location: null, phone: null, jobUrl: "https://kerr.example/projects/2" },
        { client: "Early & Co", at: "2026-10-14T07:00:00Z", location: "1 High St", phone: "07700 900123", jobUrl: "https://kerr.example/projects/1" },
      ],
      newEnquiries: [{ name: "Sam", jobType: "Flat roof" }],
      overdue: { count: 2, pence: 125_000 },
    })!;
    expect(email.subject).toBe("Today: 2 visits, 1 to reply to, £1,250 overdue");
    expect(email.html.indexOf("Early &amp; Co")).toBeLessThan(email.html.indexOf("Late"));
    expect(email.html).toContain('href="tel:07700900123"');
    expect(email.html).toContain("destination=1%20High%20St");
    expect(email.html).toContain("Sam - Flat roof");
  });
});
