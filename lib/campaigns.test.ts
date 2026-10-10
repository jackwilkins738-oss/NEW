import { describe, expect, it } from "vitest";
import { campaignHtml, eligible, parseCampaign, parseDraft, seasonalIdeas } from "./campaigns";

const now = Date.parse("2026-10-10T12:00:00Z");
const c = (id: string, over: Partial<{ email: string | null; unsubscribed_at: string | null; name: string }> = {}) => ({
  id, name: "Sue Smith", email: `${id}@x.co.uk`, unsubscribed_at: null, unsubscribe_token: `t-${id}`, ...over,
});

describe("campaigns", () => {
  it("goes only to past customers with an email, not unsubscribed, not emailed this month, each address once", () => {
    const customers = [c("a"), c("b", { email: null }), c("c", { unsubscribed_at: "2026-01-01" }), c("d"), c("e"), c("f", { email: "A@x.co.uk" }), c("g", { email: "nope" })];
    const jobs = new Set(["a", "b", "c", "e", "f", "g"]);
    const last = new Map([["e", "2026-09-25T10:00:00Z"]]);
    expect(eligible(customers, jobs, last, now).map((r) => r.id)).toEqual(["a"]);
    expect(eligible([c("e")], new Set(["e"]), new Map([["e", "2026-08-01T10:00:00Z"]]), now).map((r) => r.id)).toEqual(["e"]);
  });

  it("checks what the owner typed", () => {
    expect(parseCampaign({ subject: " ", body: "x".repeat(30) })).toEqual({ error: "Add a subject line." });
    expect(parseCampaign({ subject: "Gutters", body: "short" })).toHaveProperty("error");
    expect(parseCampaign({ subject: "Gutters  before winter", body: "We're booking gutter clears now." })).toEqual({
      subject: "Gutters before winter",
      body: "We're booking gutter clears now.",
    });
  });

  it("escapes everything and always carries the unsubscribe link", () => {
    const html = campaignHtml("Para <one>\n\nPara two", "sue smith", "Kerr & Sons", "https://x/unsubscribe/t");
    expect(html).toContain("Hi sue,");
    expect(html).toContain("<p>Para &lt;one&gt;</p><p>Para two</p>");
    expect(html).toContain("Kerr &amp; Sons has done work for you");
    expect(html).toContain('href="https://x/unsubscribe/t"');
  });

  it("throws away AI drafts that invent prices, links or numbers", () => {
    const ok = '{"subject":"Gutters before winter","body":"We are booking gutter clears now. Reply to get booked in."}';
    expect(parseDraft(`Sure: ${ok}`)).toEqual({ subject: "Gutters before winter", body: "We are booking gutter clears now. Reply to get booked in." });
    expect(parseDraft('{"subject":"Deal","body":"Only £50 this week, reply to book your slot now."}')).toBeNull();
    expect(parseDraft('{"subject":"Deal","body":"See www.kerr.co.uk for the full details of this."}')).toBeNull();
    expect(parseDraft("no json")).toBeNull();
  });

  it("suggests ideas for the season", () => {
    expect(seasonalIdeas(10)[0]).toMatch(/winter/);
    expect(seasonalIdeas(4).length).toBe(3);
  });
});
