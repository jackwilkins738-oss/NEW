import { describe, expect, it } from "vitest";
import { isValidProspectSlug, normaliseProspect, normaliseTeardown } from "./prospects";

describe("isValidProspectSlug", () => {
  it("accepts lowercase hyphenated slugs", () => {
    expect(isValidProspectSlug("smith-roofing-3f9a2")).toBe(true);
  });
  it("rejects anything that could escape a URL path or query", () => {
    for (const bad of ["Smith-Roofing", "a/b", "a..b", "-lead", "trail-", "a--b", "a b", "", "x".repeat(81)]) {
      expect(isValidProspectSlug(bad)).toBe(false);
    }
  });
});

describe("normaliseProspect", () => {
  const base = { slug: "smith-roofing-3f9a2", business_name: "Smith Roofing" };

  it("keeps public business facts only", () => {
    const res = normaliseProspect({
      ...base,
      trade: "Roofing",
      area: "Guildford",
      website: "https://www.smithroofing.co.uk/contact?x=1",
      mobile_score: "43",
      lcp_s: 6.84,
      channel: "letter",
      email: "dave@smithroofing.co.uk",
      phone: "07700 900000",
    });
    expect(res).toEqual({
      row: {
        slug: "smith-roofing-3f9a2",
        business_name: "Smith Roofing",
        trade: "Roofing",
        area: "Guildford",
        website: "smithroofing.co.uk",
        mobile_score: 43,
        lcp_s: 6.8,
        channel: "letter",
      },
    });
  });

  it("drops out-of-range numbers rather than storing them", () => {
    const res = normaliseProspect({ ...base, mobile_score: 140, lcp_s: -2 });
    expect("row" in res && res.row.mobile_score).toBe(null);
    expect("row" in res && res.row.lcp_s).toBe(null);
  });

  it("defaults an unknown channel to email", () => {
    const res = normaliseProspect({ ...base, channel: "carrier pigeon" });
    expect("row" in res && res.row.channel).toBe("email");
  });

  it("rejects a row without a business name or with a bad slug", () => {
    expect(normaliseProspect({ slug: "ok-slug", business_name: "   " })).toEqual({ error: "missing business_name" });
    expect(normaliseProspect({ slug: "Bad Slug", business_name: "X" })).toEqual({ error: "invalid slug" });
    expect(normaliseProspect(null)).toEqual({ error: "not an object" });
  });

  it("rejects a website that isn't a real host", () => {
    const res = normaliseProspect({ ...base, website: "not a site" });
    expect("row" in res && res.row.website).toBe(null);
  });
});

describe("normaliseTeardown", () => {
  it("keeps known checks and in-range numbers, drops everything else", () => {
    expect(
      normaliseTeardown({
        checks: { tapToCall: false, https: true, madeUp: false, whatsapp: "no" },
        seoScore: 78.4,
        imageSavingsKb: 1400,
        copyrightYear: 2019,
        platform: "wordpress",
        wpPluginCount: 23,
        notes: "<script>",
        accessibilityScore: 140,
      })
    ).toEqual({
      v: 1,
      checks: { tapToCall: false, https: true },
      seoScore: 78,
      imageSavingsKb: 1400,
      copyrightYear: 2019,
      platform: "wordpress",
      wpPluginCount: 23,
    });
  });

  it("rejects an unknown platform and an empty teardown", () => {
    expect(normaliseTeardown({ checks: {}, platform: "myspace" })).toBe(null);
    expect(normaliseTeardown("nope")).toBe(null);
  });
});

describe("normaliseProspect with a teardown", () => {
  const base = { slug: "smith-roofing-3f9a2", business_name: "Smith Roofing" };

  it("attaches it only with a valid check date", () => {
    const withDate = normaliseProspect({ ...base, teardown: { checks: { tapToCall: false } }, teardown_at: "2026-09-26T09:00:00Z" });
    expect("row" in withDate && withDate.row.teardown?.checks.tapToCall).toBe(false);
    expect("row" in withDate && withDate.row.teardown_at).toBe("2026-09-26T09:00:00.000Z");

    const noDate = normaliseProspect({ ...base, teardown: { checks: { tapToCall: false } } });
    expect("row" in noDate && "teardown" in noDate.row).toBe(false);
  });
});
