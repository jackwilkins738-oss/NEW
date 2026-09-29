import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

import { atVisit, extractPostcode, weatherLine, type HourlyForecast } from "./weather";
import { chaseText, greetingName, messageLinks } from "./contact";
import { pushPayload } from "./push";
import { briefEmail } from "./morningBrief";

describe("weather", () => {
  it("finds a UK postcode in an address", () => {
    expect(extractPostcode("12 High St, Guildford gu1 3aa")).toBe("GU1 3AA");
    expect(extractPostcode("Flat 2, 5 Road, SW1A1AA")).toBe("SW1A 1AA");
    expect(extractPostcode("Guildford")).toBeNull();
    expect(extractPostcode(null)).toBeNull();
  });

  it("reads the forecast at the visit's UK hour, in summer time", () => {
    const f: HourlyForecast = {
      time: ["2026-07-14T07:00", "2026-07-14T08:00", "2026-07-14T09:00"],
      precipitation_probability: [10, 70, 20],
      wind_gusts_10m: [12, 38, 15],
    };
    // 07:00 UTC is 08:00 BST.
    expect(atVisit(f, "2026-07-14T07:00:00Z")).toEqual({ rain: 70, gust: 38 });
    expect(atVisit(f, "2026-07-15T07:00:00Z")).toBeNull();
  });

  it("flags rain or wind worth rebooking over", () => {
    expect(weatherLine({ rain: 70, gust: 10 })).toEqual({ text: "70% chance of rain", bad: true });
    expect(weatherLine({ rain: 10, gust: 40 })).toEqual({ text: "10% chance of rain, gusts 40 mph", bad: true });
    expect(weatherLine({ rain: 20, gust: 22 })).toEqual({ text: "20% chance of rain, gusts 22 mph", bad: false });
  });

  it("puts tomorrow's bad weather in the brief, even on a day with nothing else", () => {
    const email = briefEmail({
      businessName: "Kerr",
      dashboardUrl: "https://x/dashboard",
      visits: [],
      tomorrowWarnings: [{ client: "Sam", at: "2026-10-14T07:00:00Z", location: null, phone: null, jobUrl: "https://x/projects/1", weather: { text: "80% chance of rain", bad: true } }],
      newEnquiries: [],
      overdue: { count: 0, pence: 0 },
      quotesWaiting: { count: 0, pence: 0 },
    })!;
    expect(email.subject).toBe("Today: weather warning for tomorrow");
    expect(email.html).toContain("80% chance of rain");
  });
});

describe("one-tap messages", () => {
  it("builds WhatsApp and text links only for usable numbers", () => {
    const l = messageLinks("07700 900123", "Hi & bye");
    expect(l.whatsapp).toBe("https://wa.me/447700900123?text=Hi%20%26%20bye");
    expect(l.sms).toBe("sms:07700900123?&body=Hi%20%26%20bye");
    expect(messageLinks(null, "x")).toEqual({ whatsapp: null, sms: null });
  });

  it("greets by first name and writes the chasers", () => {
    expect(greetingName("Sarah Kerr")).toBe("Sarah");
    expect(greetingName("J")).toBe("there");
    expect(chaseText.payment("Sam Lee", "Kerr Roofing", "INV-0007", "£450", "https://x/invoice/1/t")).toBe(
      "Hi Sam, a quick reminder about invoice INV-0007 for £450 - you can view and pay it here: https://x/invoice/1/t. Thanks, Kerr Roofing"
    );
    expect(chaseText.quote("Sam", "Kerr", "£3,000", "https://x/q")).toContain("(£3,000)");
    expect(chaseText.review("Sam", "Kerr", "https://g.page/r/x/review")).toContain("https://g.page/r/x/review");
  });
});

describe("push payload", () => {
  it("trims to what a lock screen shows", () => {
    const p = JSON.parse(pushPayload({ title: "T".repeat(200), body: "a  b\n\nc" + "x".repeat(300), url: "/dashboard" }));
    expect(p.title).toHaveLength(80);
    expect(p.body.startsWith("a b c")).toBe(true);
    expect(p.body).toHaveLength(160);
    expect(p.url).toBe("/dashboard");
  });
});
